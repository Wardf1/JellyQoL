using System.Text.Json;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.MediaHider;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Users;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
namespace MediaHider.Tests;
public sealed class NotificationTests
{
    private sealed class Fixture : IDisposable
    {
        public readonly string Directory = Path.Combine(Path.GetTempPath(), "jellyqol-test-" + Guid.NewGuid().ToString("N"));
        public readonly Mock<ILibraryManager> Library = new();
        public readonly Mock<MediaBrowser.Controller.Drawing.IImageProcessor> Images = new();
        public readonly Mock<IUserManager> Users = new();
        public readonly Mock<IMediaSourceManager> MediaSources = new();
        public readonly Mock<IApplicationPaths> Paths = new();
        public readonly List<BaseItem> Items = [];
        public readonly Dictionary<Guid,List<MediaStream>> Streams = [];
        public readonly List<User> Accounts = [];
        public readonly HashSet<Guid> Denied = [];
        public readonly UserPolicy Policy = new() { EnableAllFolders = true };
        public readonly Plugin Plugin;
        public NotificationService Service;
        public Fixture()
        {
            Paths.SetupGet(x => x.PluginConfigurationsPath).Returns(Directory);
            Paths.SetupGet(x => x.PluginsPath).Returns(Directory);
            var xml = new Mock<IXmlSerializer>();xml.Setup(x => x.DeserializeFromFile(typeof(PluginConfiguration), It.IsAny<string>())).Throws<FileNotFoundException>();
            Plugin = new Plugin(Paths.Object, xml.Object); _ = Plugin.Configuration;
            Library.Setup(x => x.GetItemById(It.IsAny<Guid>())).Returns((Guid id) => Items.FirstOrDefault(x => x.Id == id));
            Library.Setup(x => x.GetItemById<BaseItem>(It.IsAny<Guid>(), It.IsAny<User>())).Returns((Guid id, User _) => Denied.Contains(id) ? null : Items.FirstOrDefault(x => x.Id == id));
            Library.Setup(x => x.GetItemList(It.IsAny<InternalItemsQuery>())).Returns((InternalItemsQuery q) => (IReadOnlyList<BaseItem>)Items.Where(x =>
                (q.User is null || !Denied.Contains(x.Id)) &&
                (q.AncestorIds.Length == 0 || x.GetParents().Any(p => q.AncestorIds.Contains(p.Id))) &&
                (q.HasAnyProviderId == null || q.HasAnyProviderId.Any(p => x.ProviderIds.TryGetValue(p.Key, out var v) && v == p.Value))).ToArray());
            MediaSources.Setup(x=>x.GetMediaStreams(It.IsAny<Guid>())).Returns((Guid id)=>Streams.GetValueOrDefault(id) ?? []);
            BaseItem.LibraryManager = Library.Object;
            Users.Setup(x => x.GetUsers()).Returns(Accounts);
            Users.Setup(x => x.GetUserById(It.IsAny<Guid>())).Returns((Guid id) => Accounts.FirstOrDefault(x => x.Id == id));
            Users.Setup(x => x.GetUserDto(It.IsAny<User>(), It.IsAny<string?>())).Returns(new UserDto { Policy = Policy });
            Service = NewService();
        }
        public NotificationService NewService() => new(Library.Object, Users.Object, Paths.Object, NullLogger<NotificationService>.Instance, Images.Object, MediaSources.Object);
        public User User() { var user = new User(Guid.NewGuid().ToString(), "auth", "reset"); Accounts.Add(user); return user; }
        public T Item<T>(BaseItem? parent = null) where T : BaseItem, new() { var item = new T { Id = Guid.NewGuid(), Name = "Title", Path = "/media/title.mkv", ParentId = parent?.Id ?? Guid.Empty, DateCreated = DateTime.UtcNow };item.Path="/media/"+item.Id.ToString("N")+".mkv";Items.Add(item);return item; }
        public void LibraryEvent(BaseItem item) { Service.QueueItem(item);var field=typeof(NotificationService).GetField("_added",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!;var pending=(System.Collections.Concurrent.ConcurrentDictionary<Guid,DateTime>)field.GetValue(Service)!;pending[item.Id]=DateTime.UtcNow.AddSeconds(-31);Service.ProcessPending(); }
        public void Tracks(BaseItem item,int width=1920,params string[] languages) { Streams[item.Id]=[new(){Type=MediaStreamType.Video,Width=width,Height=width==3840?2160:width==1280?720:1080,Codec="h264"},..languages.Select(language=>new MediaStream{Type=MediaStreamType.Audio,Language=language,Codec="aac"})]; }
        public void Enable() => Service.Configure(new NotificationOptions { Enabled = true });
        public void Receive(BaseItem item, User? requester = null) { Service.Receive(JsonSerializer.SerializeToElement(new { notification_type = "MEDIA_AVAILABLE", mediaType = item is Movie ? "movie" : "tv", jellyfinMediaId = item.Id, requestedBy_jellyfinUserId = requester?.Id.ToString() ?? "", request_id = "1" }));Service.ProcessPending(); }
        public void Dispose() { Service.Dispose(); if (System.IO.Directory.Exists(Directory)) System.IO.Directory.Delete(Directory, true); }
    }
    [Fact] public void DefaultsEnableBothSourcesButRequireAdministratorActivation()
    {
        using var f = new Fixture(); var u=f.User();var feed=f.Service.Feed(u.Id);
        Assert.False(feed.Available);Assert.True(feed.Preferences.Seerr);Assert.True(feed.Preferences.Library);Assert.True(feed.Preferences.Popups);
        Assert.False(f.Service.AcceptSecret("")); f.Enable();var secret=f.Service.Options().Secret;
        Assert.True(f.Service.AcceptSecret(secret));Assert.False(f.Service.AcceptSecret("wrong"));f.Service.RotateSecret();Assert.False(f.Service.AcceptSecret(secret));
    }
    [Fact] public void WebhookWaitsForMatchingMaterialAndNeverMatchesByUntrustedTitle()
    {
        using var f = new Fixture();var u=f.User();f.Enable();
        f.Service.Receive(JsonSerializer.SerializeToElement(new {notification_type="MEDIA_AVAILABLE", mediaType="movie",tmdbId="999",subject="Title"}));f.Service.ProcessPending();Assert.Empty(f.Service.Feed(u.Id).Items);
        var movie=f.Item<Movie>();movie.ProviderIds["Tmdb"]="999";f.Service.ProcessPending();Assert.Single(f.Service.Feed(u.Id).Items);
        Assert.Throws<ArgumentException>(()=>f.Service.Receive(JsonSerializer.SerializeToElement(new {notification_type="MEDIA_AVAILABLE",mediaType="movie",subject="Title"})));
    }
    [Fact] public void NativeAccessAndImmediateMediaHiderRulesFilterHistoryAndActions()
    {
        using var f = new Fixture();var u=f.User();f.Enable();var movie=f.Item<Movie>();f.Receive(movie);var id=Assert.Single(f.Service.Feed(u.Id).Items).Ids[0];
        f.Denied.Add(movie.Id);Assert.Empty(f.Service.Feed(u.Id).Items);Assert.Empty(f.Service.Act(u.Id,new(){Ids=[id],Action="read"}));f.Denied.Clear();
        f.Plugin.Configuration.HiddenItemIds=[movie.Id];Assert.Empty(f.Service.Feed(u.Id).Items);f.Plugin.Configuration.HiddenItemIds=[];
        var group=new UserGroup{Id=Guid.NewGuid(),UserIds=[u.Id]};f.Plugin.Configuration.Groups=[group];f.Plugin.Configuration.GroupRules=[new(){ItemId=movie.Id,GroupIds=[group.Id]}];Assert.Empty(f.Service.Feed(u.Id).Items);
    }
    [Fact] public void ClaimsAreAtomicAcrossDevicesAndShownIsIndependentOfRead()
    {
        using var f = new Fixture();var u=f.User();var other=f.User();f.Enable();var movie=f.Item<Movie>();f.Receive(movie);var id=Assert.Single(f.Service.Feed(u.Id,true).Items).Ids[0];
        Assert.Single(f.Service.Act(u.Id,new(){Ids=[id],Action="claim"}));Assert.Empty(f.Service.Act(u.Id,new(){Ids=[id],Action="claim"}));Assert.Empty(f.Service.Feed(u.Id,true).Items);
        Assert.Equal(1,f.Service.Feed(u.Id).Unread);Assert.Single(f.Service.Feed(other.Id,true).Items);
        f.Service.Act(u.Id,new(){Ids=[id],Action="later"});Assert.Empty(f.Service.Feed(u.Id,true).Items);Assert.False(Assert.Single(f.Service.Feed(u.Id).Items).Shown);
        f.Service.Act(u.Id,new(){Ids=[id],Action="read"});Assert.Equal(0,f.Service.Feed(u.Id).Unread);
        var restarted=f.NewService();Assert.True(Assert.Single(restarted.Feed(u.Id).Items).Read);restarted.Dispose();
    }
    [Fact] public void OwnRequestsDoNotLeakOtherRequestersAndPreferencesSurviveRestart()
    {
        using var f=new Fixture();var a=f.User();var b=f.User();f.Enable();var movie=f.Item<Movie>();f.Receive(movie,a);
        f.Service.Preferences(b.Id,new(){OnlyOwnRequests=true,Library=false});Assert.Empty(f.Service.Feed(b.Id).Items);
        f.Service.Preferences(a.Id,new(){OnlyOwnRequests=true,Library=false});Assert.Single(f.Service.Feed(a.Id).Items);Assert.True(f.Service.Feed(a.Id).OwnRequestsLinked);
        var restarted=f.NewService();Assert.True(restarted.Feed(b.Id).Preferences.OnlyOwnRequests);Assert.Empty(restarted.Feed(b.Id).Items);restarted.Dispose();
    }
    [Fact] public void GroupEpisodesAndMergeRepeatedWebhooksWithoutReplayingPopup()
    {
        using var f=new Fixture();var u=f.User();f.Enable();var series=f.Item<Series>();var season=f.Item<Season>(series);f.Item<Episode>(season);f.Item<Episode>(season);f.Receive(series,u);
        var entry=Assert.Single(f.Service.Feed(u.Id).Items);Assert.Equal(2,entry.Count);Assert.Equal(series.Id,entry.ItemId);
        f.Service.Act(u.Id,new(){Ids=entry.Ids,Action="claim"});f.Receive(series,u);Assert.Empty(f.Service.Feed(u.Id,true).Items);Assert.Equal(2,Assert.Single(f.Service.Feed(u.Id).Items).Count);
        f.Service.Preferences(u.Id,new(){Episodes=false});Assert.Equal("Series",Assert.Single(f.Service.Feed(u.Id).Items).Type);
        f.Service.Preferences(u.Id,new(){Series=false,Episodes=false});Assert.Empty(f.Service.Feed(u.Id).Items);
    }
    [Fact] public void NewAccountsReceiveFutureEventsAndNoBackfillAtActivation()
    {
        using var f=new Fixture();var a=f.User();f.Item<Movie>();f.Enable();Assert.Empty(f.Service.Feed(a.Id).Items);var movie=f.Item<Movie>();f.Receive(movie);
        var b=f.User();f.Service.RegisterAccounts();Assert.Empty(f.Service.Feed(b.Id).Items);Assert.Single(f.Service.Feed(a.Id).Items);
        var next=f.Item<Movie>();f.Receive(next);Assert.Single(f.Service.Feed(b.Id).Items);
    }
    [Fact] public void VirtualAndMissingFilesNeverCreatePlayableNotifications()
    {
        using var f=new Fixture();var u=f.User();f.Enable();var movie=f.Item<Movie>();movie.IsVirtualItem=true;f.Receive(movie);Assert.Empty(f.Service.Feed(u.Id).Items);
        movie.IsVirtualItem=false;movie.Path="";f.Service.ProcessPending();Assert.Empty(f.Service.Feed(u.Id).Items);
    }
    [Fact] public void InvalidActionsAndUnknownAccountsAreRejected()
    {
        using var f=new Fixture();var u=f.User();Assert.Throws<UnauthorizedAccessException>(()=>f.Service.Feed(Guid.NewGuid()));
        Assert.Throws<ArgumentException>(()=>f.Service.Act(u.Id,new(){Action="arbitrary"}));Assert.Throws<ArgumentException>(()=>f.Service.Configure(new(){RetentionDays=0}));
        Assert.Null(SeerrWebhook.Parse(JsonSerializer.SerializeToElement(new {notification_type="TEST_NOTIFICATION"})));
        Assert.Throws<ArgumentException>(()=>SeerrWebhook.Parse(JsonSerializer.SerializeToElement(new {notification_type="MEDIA_PENDING"})));
    }
    [Fact] public void ExplicitLibraryRestrictionsFailClosedEvenWhenStandaloneItemVisibilitySucceeds()
    {
        using var f = new Fixture(); var u = f.User(); f.Enable(); var movie = f.Item<Movie>(); f.Receive(movie);
        var libraryId = Guid.NewGuid();
        f.Library.Setup(x => x.GetVirtualFolders()).Returns([new MediaBrowser.Model.Entities.VirtualFolderInfo { ItemId = libraryId.ToString("N"), Locations = ["/media"] }]);
        f.Policy.EnableAllFolders = false; Assert.Empty(f.Service.Feed(u.Id).Items);
        f.Policy.EnabledFolders = [libraryId]; Assert.Single(f.Service.Feed(u.Id).Items);
        movie.Path = "/media-backup/title.mkv"; Assert.Empty(f.Service.Feed(u.Id).Items);
        movie.Path = "/media/title.mkv"; f.Policy.EnableAllFolders = true; f.Policy.BlockedMediaFolders = [libraryId]; Assert.Empty(f.Service.Feed(u.Id).Items);
    }
    [Fact] public void SeerrUsernameMappingSupportsOwnRequestsWithoutAJellyfinIdInTheWebhook()
    {
        using var f = new Fixture(); var u = f.User(); f.Enable(); var movie = f.Item<Movie>();
        f.Service.Configure(new() { Enabled = true, AccountMappings = new() { ["example_user"] = u.Id } });
        f.Service.Preferences(u.Id, new() { OnlyOwnRequests = true, Library = false });
        f.Service.Receive(JsonSerializer.SerializeToElement(new { notification_type = "MEDIA_AVAILABLE", mediaType = "movie", jellyfinMediaId = movie.Id, requestedBy_username = "example_user" }));
        f.Service.ProcessPending(); Assert.True(f.Service.Feed(u.Id).OwnRequestsLinked); Assert.Single(f.Service.Feed(u.Id).Items);
    }
    [Fact] public void SeerrSeasonExtrasAndEmptyProviderVariablesAreHandled()
    {
        var parsed = SeerrWebhook.Parse(JsonSerializer.SerializeToElement(new { notification_type = "MEDIA_AVAILABLE", mediaType = "tv", tmdbId = "123", tvdbId = "{{media_tvdbid}}", extra = new[] { new { name = "Requested Seasons", value = "1, 2" } } }));
        Assert.NotNull(parsed); Assert.Equal("1, 2", parsed.Seasons); Assert.Empty(parsed.TvdbId);
    }
    [Fact] public void ClearingHistoryAffectsOnlyTheCurrentAccountAndSurvivesRestart()
    {
        using var f = new Fixture(); var a = f.User(); var b = f.User(); f.Enable();
        f.Service.Preferences(a.Id, new() { Popups = false });
        var movie = f.Item<Movie>(); f.Receive(movie);
        Assert.Single(f.Service.Feed(a.Id).Items); Assert.Single(f.Service.Feed(b.Id).Items);
        f.Service.ClearHistory(a.Id);
        Assert.Empty(f.Service.Feed(a.Id).Items); Assert.Equal(0, f.Service.Feed(a.Id).Unread);
        Assert.Single(f.Service.Feed(b.Id).Items); Assert.False(f.Service.Feed(a.Id).Preferences.Popups);
        var restarted = f.NewService(); Assert.Empty(restarted.Feed(a.Id).Items); restarted.Dispose();
        var next = f.Item<Movie>(); f.Receive(next);
        Assert.Single(f.Service.Feed(a.Id).Items); Assert.Equal(2, f.Service.Feed(b.Id).Items.Length);
        Assert.Throws<UnauthorizedAccessException>(() => f.Service.ClearHistory(Guid.NewGuid()));
    }    [Fact] public void AppearancePreferencesAreAccountScopedValidatedAndPersisted()
    {
        using var f = new Fixture(); var a = f.User(); var b = f.User(); var libraryId = Guid.NewGuid();
        f.Service.Preferences(a.Id, new() { HideHeaderLibraries = true, HiddenHeaderLibraryIds = [libraryId, libraryId], FavoritesAsIcon = false });
        var own = f.Service.Feed(a.Id).Preferences;
        Assert.True(own.HideHeaderLibraries); Assert.Single(own.HiddenHeaderLibraryIds); Assert.False(own.FavoritesAsIcon);
        var other = f.Service.Feed(b.Id).Preferences;
        Assert.False(other.HideHeaderLibraries); Assert.Empty(other.HiddenHeaderLibraryIds); Assert.True(other.FavoritesAsIcon);
        var restarted = f.NewService(); Assert.Equal(libraryId, Assert.Single(restarted.Feed(a.Id).Preferences.HiddenHeaderLibraryIds)); restarted.Dispose();
        Assert.Throws<ArgumentException>(() => f.Service.Preferences(a.Id, new() { HiddenHeaderLibraryIds = [Guid.Empty] }));
        Assert.True(f.Service.Feed(a.Id).Preferences.HideHeaderLibraries);
    }    [Fact] public void MediaBarUsesAdminSettingsAndRechecksNativeAndMediaHiderAccess()
    {
        using var f = new Fixture(); var user = f.User(); var a = f.Item<Movie>(); var b = f.Item<Movie>();
        foreach (var item in new[] { a, b }) item.SetImage(new ItemImageInfo { Type = ImageType.Backdrop, Path = "/media/backdrop.jpg" }, 0);
        f.Plugin.Configuration.QoL.MediaBar = new() { Enabled = true, Source = "recent", ItemCount = 1, AutoRotate = false };
        var feed = f.Service.MediaBar(user.Id); Assert.Single(feed.Items); Assert.False(feed.Settings.AutoRotate); Assert.True(feed.TrailersEnabled);
        f.Denied.UnionWith([a.Id, b.Id]); Assert.Empty(f.Service.MediaBar(user.Id).Items); f.Denied.Clear();
        f.Plugin.Configuration.HiddenItemIds = [a.Id, b.Id]; Assert.Empty(f.Service.MediaBar(user.Id).Items);
        f.Plugin.Configuration.HiddenItemIds = []; f.Plugin.Configuration.QoL.MediaBar.Enabled = false; Assert.Empty(f.Service.MediaBar(user.Id).Items);
        Assert.Throws<UnauthorizedAccessException>(() => f.Service.MediaBar(Guid.NewGuid()));
    }
    [Fact] public void MediaBarTrailersRespectPersonalOptOutAndYoutubeUrlsAreRestricted()
    {
        using var f = new Fixture(); var user = f.User(); var movie = f.Item<Movie>();
        movie.SetImage(new ItemImageInfo { Type = ImageType.Backdrop, Path = "/media/backdrop.jpg" }, 0);
        movie.RemoteTrailers = [new MediaUrl { Url = "https://www.youtube.com/watch?v=M7lc1UVf-VE" }];
        f.Service.Preferences(user.Id, new() { MediaBarTrailers = false });
        Assert.Null(Assert.Single(f.Service.MediaBar(user.Id).Items).Trailer);
        f.Service.Preferences(user.Id, new() { MediaBarTrailers = true });
        Assert.Equal("M7lc1UVf-VE", Assert.Single(f.Service.MediaBar(user.Id).Items).Trailer?.YouTubeId);
        Assert.Null(NotificationService.YouTubeId("https://evil.example/watch?v=M7lc1UVf-VE"));
        Assert.Null(NotificationService.YouTubeId("https://youtube.com.evil.example/watch?v=M7lc1UVf-VE"));
        Assert.Null(NotificationService.YouTubeId("http://youtube.com/watch?v=M7lc1UVf-VE"));
        Assert.Null(NotificationService.YouTubeId("https://user:password@youtube.com/watch?v=M7lc1UVf-VE"));
        Assert.Equal("M7lc1UVf-VE", NotificationService.YouTubeId("https://youtu.be/M7lc1UVf-VE"));
    }
    [Fact] public void MediaBarSettingsHaveBoundedValuesAndPreserveExistingQoLSettings()
    {
        Assert.Throws<ArgumentException>(() => new QoLSettings { MediaBar = new() { ItemCount = 0 } }.Validated());
        Assert.Throws<ArgumentException>(() => new QoLSettings { MediaBar = new() { IntervalSeconds = 1 } }.Validated());
        Assert.Throws<ArgumentException>(() => new QoLSettings { MediaBar = new() { Source = "arbitrary" } }.Validated());
        var value = new QoLSettings { EnablePagination = false, MediaBar = new() { Enabled = false, Source = "recent" } }.Validated();
        Assert.False(value.EnablePagination); Assert.False(value.MediaBar.Enabled); Assert.Equal("recent", value.MediaBar.Source);
    }

    [Fact] public void MediaBarUsesGlobalAppearanceAndTrailerSourceWithOnlyPersonalTrailerOptOut()
    {
        using var f=new Fixture();var a=f.User();var b=f.User();
        f.Plugin.Configuration.QoL.MediaBar=new(){Layout="card",BackdropPosition="bottom",TrailerSource="youtube",TrailerDelay=7,PauseDuringTrailer=false};
        var legacy=JsonSerializer.Deserialize<NotificationPreferences>("{\"MediaBarTrailers\":true,\"MediaBarAppearance\":{\"Layout\":\"banner\"},\"MediaBarTrailerAutoplay\":false}")!;
        f.Service.Preferences(a.Id,legacy);f.Service.Preferences(b.Id,new(){MediaBarTrailers=false,MediaBarTrailerSound=true});
        var own=f.Service.MediaBar(a.Id);Assert.Equal("card",own.Settings.Layout);Assert.Equal("bottom",own.Settings.BackdropPosition);Assert.True(own.TrailerAutoplay);Assert.True(own.Settings.PauseDuringTrailer);Assert.Equal("youtube",own.TrailerSource);Assert.Equal(7,own.TrailerDelay);
        Assert.False(f.Service.MediaBar(b.Id).TrailersEnabled);Assert.True(f.Service.MediaBar(b.Id).TrailerSound);Assert.False(own.TrailerSound);Assert.True(own.TrailersEnabled);
        var restarted=f.NewService();Assert.False(restarted.MediaBar(b.Id).TrailersEnabled);restarted.Dispose();
        Assert.Throws<ArgumentException>(()=>new MediaBarSettings{TrailerSource="arbitrary"}.Validated());
        Assert.Throws<ArgumentException>(()=>new MediaBarSettings{TrailerDelay=16}.Validated());
    }

    [Fact] public void SeerrDoesNotAnnounceMoviesThatHaveAlreadyBeenInTheLibraryForWeeks()
    {
        using var f=new Fixture();var user=f.User();f.Enable();var movie=f.Item<Movie>();movie.DateCreated=DateTime.UtcNow.AddDays(-30);
        f.Receive(movie);Assert.Empty(f.Service.Feed(user.Id).Items);
        f.Service.Receive(JsonSerializer.SerializeToElement(new{notification_type="MEDIA_AVAILABLE",mediaType="movie",jellyfinMediaId=movie.Id,request_id="new-request"}));f.Service.ProcessPending();
        Assert.Empty(f.Service.Feed(user.Id).Items);
        var state=JsonSerializer.SerializeToElement(f.Service.Diagnostics());Assert.Equal(2,state.GetProperty("IgnoredExisting").GetInt32());
    }
    [Fact] public void ExplicitSeerrSeasonIncludesOnlyNewEpisodesAndNeverReannouncesOldOnes()
    {
        using var f=new Fixture();var user=f.User();var series=f.Item<Series>();var season=f.Item<Season>(series);f.Enable();
        var old=f.Item<Episode>(season);old.ParentIndexNumber=1;old.DateCreated=DateTime.UtcNow.AddDays(-30);
        var fresh=f.Item<Episode>(season);fresh.ParentIndexNumber=1;
        f.Service.Receive(JsonSerializer.SerializeToElement(new{notification_type="MEDIA_AVAILABLE",mediaType="tv",jellyfinMediaId=series.Id,seasons="1"}));f.Service.ProcessPending();
        var entry=Assert.Single(f.Service.Feed(user.Id).Items);Assert.Equal(1,entry.Count);
    }
    [Fact] public void ObservedNewAvailabilityAllowsOldFileDatesEvenWithLibraryNewsDisabledAndSurvivesRestart()
    {
        using var f=new Fixture();var user=f.User();f.Service.Configure(new(){Enabled=true,Library=false});
        var movie=f.Item<Movie>();movie.DateCreated=DateTime.UtcNow.AddDays(-30);f.Service.QueueItem(movie);f.Receive(movie);Assert.Single(f.Service.Feed(user.Id).Items);
        var restarted=f.NewService();restarted.Receive(JsonSerializer.SerializeToElement(new{notification_type="MEDIA_AVAILABLE",mediaType="movie",jellyfinMediaId=movie.Id,request_id="another"}));restarted.ProcessPending();
        Assert.Single(restarted.Feed(user.Id).Items);Assert.Equal(0,JsonSerializer.SerializeToElement(restarted.Diagnostics()).GetProperty("IgnoredExisting").GetInt32());restarted.Dispose();
    }

    [Fact] public void MediaBarRefreshesAllMetadataAndNativeImageTagsWithoutReplacingTheCachedSelection()
    {
        using var f=new Fixture();var user=f.User();var movie=f.Item<Movie>();f.Plugin.Configuration.QoL.MediaBar.ItemCount=1;
        movie.SetImage(new(){Type=ImageType.Backdrop,Path="/media/backdrop.jpg"},0);movie.SetImage(new(){Type=ImageType.Logo,Path="/media/logo.png"},0);
        var logo="logo-v1";var backdrop="backdrop-v1";
        f.Images.Setup(x=>x.GetImageCacheTag(It.IsAny<BaseItem>(),It.IsAny<ItemImageInfo>())).Returns((BaseItem _,ItemImageInfo image)=>image.Type==ImageType.Logo?logo:backdrop);
        var first=Assert.Single(f.Service.MediaBar(user.Id).Items);Assert.Equal("logo-v1",first.LogoImageTag);Assert.Equal("backdrop-v1",first.BackdropImageTag);
        movie.Name="Updated title";movie.Overview="Updated overview";movie.ProductionYear=2027;movie.CommunityRating=9.1f;movie.OfficialRating="16";movie.Genres=["Updated genre"];movie.RemoteTrailers=[new(){Url="https://youtu.be/M7lc1UVf-VE"}];logo="logo-v2";backdrop="backdrop-v2";
        var updated=Assert.Single(f.Service.MediaBar(user.Id).Items);Assert.Equal(first.Id,updated.Id);Assert.Equal("Updated title",updated.Name);Assert.Equal("Updated overview",updated.Overview);Assert.Equal(2027,updated.Year);Assert.Equal(9.1f,updated.CommunityRating);Assert.Equal("16",updated.OfficialRating);Assert.Equal("Updated genre",Assert.Single(updated.Genres));Assert.Equal("logo-v2",updated.LogoImageTag);Assert.Equal("backdrop-v2",updated.BackdropImageTag);Assert.Equal("M7lc1UVf-VE",updated.Trailer?.YouTubeId);
        f.Library.Verify(x=>x.GetItemList(It.Is<InternalItemsQuery>(q=>q.IncludeItemTypes.Contains(Jellyfin.Data.Enums.BaseItemKind.Movie)&&q.IncludeItemTypes.Contains(Jellyfin.Data.Enums.BaseItemKind.Series))),Times.Once);
    }
    [Fact] public void RandomMediaBarRotatesAfterTenMinutesWithoutExtendingExpiryOnMetadataRefresh()
    {
        using var f=new Fixture();var user=f.User();var first=f.Item<Movie>();var second=f.Item<Movie>();
        foreach(var movie in new[]{first,second})movie.SetImage(new(){Type=ImageType.Backdrop,Path="/media/backdrop.jpg"},0);
        f.Plugin.Configuration.QoL.MediaBar=new(){Enabled=true,Source="random",ItemCount=1};
        var before=DateTime.UtcNow;var selected=Assert.Single(f.Service.MediaBar(user.Id).Items);
        var field=typeof(NotificationService).GetField("_featuredCache",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!;
        var cache=(Dictionary<Guid,(DateTime Expires,int Count,Guid[] Ids)>)field.GetValue(f.Service)!;
        Assert.InRange(cache[user.Id].Expires,before.AddMinutes(10),DateTime.UtcNow.AddMinutes(10));
        var fixedExpiry=DateTime.UtcNow.AddMinutes(5);cache[user.Id]=(fixedExpiry,1,[selected.Id]);
        for(var n=0;n<3;n++){Assert.Equal(selected.Id,Assert.Single(f.Service.MediaBar(user.Id).Items).Id);Assert.Equal(fixedExpiry,cache[user.Id].Expires);}
        cache[user.Id]=(DateTime.UtcNow.AddSeconds(-1),1,[selected.Id]);
        var renewed=Assert.Single(f.Service.MediaBar(user.Id).Items);Assert.NotEqual(selected.Id,renewed.Id);
        Assert.InRange(cache[user.Id].Expires,DateTime.UtcNow.AddMinutes(10).AddSeconds(-2),DateTime.UtcNow.AddMinutes(10));
        f.Denied.Add(renewed.Id);var deadline=cache[user.Id].Expires;Assert.DoesNotContain(f.Service.MediaBar(user.Id).Items,item=>item.Id==renewed.Id);Assert.Equal(deadline,cache[user.Id].Expires);
    }
    [Fact] public void MediaBarCountsOnlyAccessibleNonSpecialSeasonsWithPlayableEpisodesAndRefreshesTheCount()
    {
        using var f=new Fixture();var user=f.User();var series=f.Item<Series>();f.Service.Preferences(user.Id,new(){MediaBarTrailers=false});series.SetImage(new(){Type=ImageType.Backdrop,Path="/media/backdrop.jpg"},0);
        Episode Episode(int season){var e=f.Item<Episode>(series);e.ParentIndexNumber=season;return e;}
        Episode(0);Episode(1);Episode(1);var empty=f.Item<Season>(series);empty.IndexNumber=2;
        Episode(3).IsVirtualItem=true;Episode(4).Path="";var denied=Episode(5);f.Denied.Add(denied.Id);Episode(6);Episode(-1);
        Assert.Equal(2,Assert.Single(f.Service.MediaBar(user.Id).Items).SeasonCount);
        Episode(2);Assert.Equal(3,Assert.Single(f.Service.MediaBar(user.Id).Items).SeasonCount);
        f.Denied.Clear();Assert.Equal(4,Assert.Single(f.Service.MediaBar(user.Id).Items).SeasonCount);
        f.Library.Verify(x=>x.GetItemList(It.Is<InternalItemsQuery>(q=>q.IncludeItemTypes.Contains(Jellyfin.Data.Enums.BaseItemKind.Episode)&&q.User==user&&q.ParentIndexNumberNotEquals==0)),Times.Exactly(3));
    }
    [Fact] public void NewTitlesAreGenericAndOnlyViewerUsefulChangesCreateUpdateNotifications()
    {
        using var f=new Fixture();var user=f.User();f.Enable();var movie=f.Item<Movie>();f.Tracks(movie,1920,"eng");f.LibraryEvent(movie);
        var first=Assert.Single(f.Service.Feed(user.Id).Items);Assert.Null(first.Changes);f.Service.Act(user.Id,new(){Action="read",Ids=first.Ids});
        f.Tracks(movie,3840,"en","pol");f.Streams[movie.Id].Add(new(){Type=MediaStreamType.Subtitle,Language="pol"});f.LibraryEvent(movie);
        var feed=f.Service.Feed(user.Id);Assert.Equal(2,feed.Items.Length);Assert.Equal(1,feed.Unread);var update=Assert.Single(feed.Items,x=>x.Changes is not null);Assert.Equal("4K",update.Changes!.Quality);Assert.Equal(["pl"],update.Changes.AudioLanguages);Assert.Equal(["pl"],update.Changes.SubtitleLanguages);
        f.Service.Act(user.Id,new(){Action="read",Ids=update.Ids});movie.Name="Changed metadata";movie.Path="/media/replaced-file.mkv";f.Streams[movie.Id][0].Codec="hevc";f.Streams[movie.Id][0].BitRate=12000000;f.LibraryEvent(movie);Assert.Equal(0,f.Service.Feed(user.Id).Unread);Assert.Equal(2,f.Service.Feed(user.Id).Items.Length);
        f.Tracks(movie,1280,"en");f.LibraryEvent(movie);Assert.Equal(0,f.Service.Feed(user.Id).Unread);
    }
    [Fact] public void ReplacedEpisodeWithNewPathAndIdKeepsIdentityAcrossRestartAndHistoryClearing()
    {
        using var f=new Fixture();var user=f.User();var other=f.User();f.Enable();var series=f.Item<Series>();series.ProviderIds["Tvdb"]="123";var original=f.Item<Episode>(series);original.SeriesId=series.Id;original.ParentIndexNumber=1;original.IndexNumber=2;f.Tracks(original,1920,"en");f.LibraryEvent(original);
        f.Service.ClearHistory(user.Id);f.Service.Dispose();f.Service=f.NewService();
        f.Items.Remove(original);var replacement=f.Item<Episode>(series);replacement.SeriesId=series.Id;replacement.ParentIndexNumber=1;replacement.IndexNumber=2;replacement.Path="/media/new-name.mkv";f.Tracks(replacement,1920,"eng");f.LibraryEvent(replacement);Assert.Empty(f.Service.Feed(user.Id).Items);Assert.Single(f.Service.Feed(other.Id).Items);
        f.Tracks(replacement,1920,"en","pl");f.LibraryEvent(replacement);var update=Assert.Single(f.Service.Feed(user.Id).Items);Assert.NotNull(update.Changes);Assert.Equal(["pl"],update.Changes!.AudioLanguages);Assert.False(update.Read);
        f.Denied.Add(replacement.Id);Assert.Empty(f.Service.Feed(user.Id).Items);
    }
    [Fact] public void BaselineDoesNotAnnounceExistingLibraryOrUnknownTechnicalMetadataAsNew()
    {
        using var f=new Fixture();var user=f.User();var movie=f.Item<Movie>();movie.ProviderIds["Tmdb"]="456";f.Tracks(movie,1920,"en");f.Enable();Assert.Empty(f.Service.Feed(user.Id).Items);
        f.LibraryEvent(movie);Assert.Empty(f.Service.Feed(user.Id).Items);
        var replacement=f.Item<Movie>();replacement.ProviderIds["Tmdb"]="456";replacement.Path="/media/renamed.mkv";f.Items.Remove(movie);f.Tracks(replacement,1920,"en");f.LibraryEvent(replacement);Assert.Empty(f.Service.Feed(user.Id).Items);
        f.Tracks(replacement,3840,"en");f.LibraryEvent(replacement);Assert.Equal("4K",Assert.Single(f.Service.Feed(user.Id).Items).Changes!.Quality);
    }
    [Fact] public void UpdateGroupingNeverClaimsFeaturesForEpisodesWithDifferentChanges()
    {
        using var f=new Fixture();var user=f.User();var series=f.Item<Series>();var a=f.Item<Episode>(series);a.SeriesId=series.Id;a.ParentIndexNumber=1;a.IndexNumber=1;var b=f.Item<Episode>(series);b.SeriesId=series.Id;b.ParentIndexNumber=1;b.IndexNumber=2;f.Tracks(a,1920,"en");f.Tracks(b,1920,"en");f.Enable();
        f.Tracks(a,1920,"en","pl");f.LibraryEvent(a);f.Tracks(b,3840,"en");f.LibraryEvent(b);var updates=f.Service.Feed(user.Id).Items;Assert.Equal(2,updates.Length);Assert.All(updates,x=>Assert.Equal(1,x.Count));Assert.Single(updates,x=>x.Changes?.Quality=="4K");Assert.Single(updates,x=>x.Changes?.AudioLanguages.Contains("pl")==true);
    }
    [Fact] public void SeerrAndLibraryMergeTheSameUpgradeWithoutReplayingTheInitialNotification()
    {
        using var f=new Fixture();var user=f.User();f.Enable();var movie=f.Item<Movie>();f.Tracks(movie,1920,"en");f.LibraryEvent(movie);var original=Assert.Single(f.Service.Feed(user.Id).Items);f.Service.Act(user.Id,new(){Action="read",Ids=original.Ids});
        f.Tracks(movie,3840,"en");f.LibraryEvent(movie);f.Receive(movie,user);var feed=f.Service.Feed(user.Id);Assert.Equal(2,feed.Items.Length);var update=Assert.Single(feed.Items,x=>x.Changes is not null);Assert.True(update.Library);Assert.True(update.Seerr);Assert.Equal(1,feed.Unread);
        f.LibraryEvent(movie);f.Receive(movie,user);Assert.Equal(2,f.Service.Feed(user.Id).Items.Length);
    }

    [Fact] public void ComparisonSurvivesHistoryRetentionAndDoesNotGuessMissingTechnicalData()
    {
        using var f=new Fixture();var user=f.User();var unknown=f.Item<Movie>();f.Enable();f.Tracks(unknown,3840,"pl");f.LibraryEvent(unknown);Assert.Empty(f.Service.Feed(user.Id).Items);
        var movie=f.Item<Movie>();f.Tracks(movie,1920,"en");f.LibraryEvent(movie);Assert.Single(f.Service.Feed(user.Id).Items);
        var field=typeof(NotificationService).GetField("_data",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!;var data=(NotificationData)field.GetValue(f.Service)!;foreach(var record in data.Records)record.Created=DateTime.UtcNow.AddDays(-40);f.Service.ProcessPending();Assert.Empty(f.Service.Feed(user.Id).Items);
        f.LibraryEvent(movie);Assert.Empty(f.Service.Feed(user.Id).Items);f.Tracks(movie,3840,"en");f.LibraryEvent(movie);Assert.Equal("4K",Assert.Single(f.Service.Feed(user.Id).Items).Changes!.Quality);
    }
    [Fact] public void ReenablingNotificationsBaselinesMaterialsAddedWhileDisabled()
    {
        using var f=new Fixture();var user=f.User();f.Enable();f.Service.Configure(new(){Enabled=false});var movie=f.Item<Movie>();f.Tracks(movie,1920,"en");f.Enable();f.LibraryEvent(movie);Assert.Empty(f.Service.Feed(user.Id).Items);f.Tracks(movie,1920,"en","pl");f.LibraryEvent(movie);Assert.Equal(["pl"],Assert.Single(f.Service.Feed(user.Id).Items).Changes!.AudioLanguages);
    }

    [Fact] public void ReusedFilePathWithDifferentMovieIdentityIsANewArrival()
    {
        using var f=new Fixture();var user=f.User();var old=f.Item<Movie>();old.ProviderIds["Tmdb"]="111";f.Tracks(old,1920,"en");f.Enable();f.Items.Remove(old);
        var movie=f.Item<Movie>();movie.ProviderIds["Tmdb"]="222";movie.Path=old.Path;f.Tracks(movie,3840,"pl");f.LibraryEvent(movie);Assert.Null(Assert.Single(f.Service.Feed(user.Id).Items).Changes);
    }

}
