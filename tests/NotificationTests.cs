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
        public readonly Mock<IUserManager> Users = new();
        public readonly Mock<IApplicationPaths> Paths = new();
        public readonly List<BaseItem> Items = [];
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
                (q.AncestorIds.Length == 0 || x.GetParents().Any(p => q.AncestorIds.Contains(p.Id))) &&
                (q.HasAnyProviderId == null || q.HasAnyProviderId.Any(p => x.ProviderIds.TryGetValue(p.Key, out var v) && v == p.Value))).ToArray());
            BaseItem.LibraryManager = Library.Object;
            Users.Setup(x => x.GetUsers()).Returns(Accounts);
            Users.Setup(x => x.GetUserById(It.IsAny<Guid>())).Returns((Guid id) => Accounts.FirstOrDefault(x => x.Id == id));
            Users.Setup(x => x.GetUserDto(It.IsAny<User>(), It.IsAny<string?>())).Returns(new UserDto { Policy = Policy });
            Service = NewService();
        }
        public NotificationService NewService() => new(Library.Object, Users.Object, Paths.Object, NullLogger<NotificationService>.Instance);
        public User User() { var user = new User(Guid.NewGuid().ToString(), "auth", "reset"); Accounts.Add(user); return user; }
        public T Item<T>(BaseItem? parent = null) where T : BaseItem, new() { var item = new T { Id = Guid.NewGuid(), Name = "Title", Path = "/media/title.mkv", ParentId = parent?.Id ?? Guid.Empty, DateCreated = DateTime.UtcNow };Items.Add(item);return item; }
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
        var feed = f.Service.MediaBar(user.Id); Assert.Single(feed.Items); Assert.False(feed.Settings.AutoRotate); Assert.False(feed.TrailersEnabled);
        f.Denied.UnionWith([a.Id, b.Id]); Assert.Empty(f.Service.MediaBar(user.Id).Items); f.Denied.Clear();
        f.Plugin.Configuration.HiddenItemIds = [a.Id, b.Id]; Assert.Empty(f.Service.MediaBar(user.Id).Items);
        f.Plugin.Configuration.HiddenItemIds = []; f.Plugin.Configuration.QoL.MediaBar.Enabled = false; Assert.Empty(f.Service.MediaBar(user.Id).Items);
        Assert.Throws<UnauthorizedAccessException>(() => f.Service.MediaBar(Guid.NewGuid()));
    }
    [Fact] public void MediaBarTrailersAreOffUntilTheAccountOptsInAndYoutubeUrlsAreRestricted()
    {
        using var f = new Fixture(); var user = f.User(); var movie = f.Item<Movie>();
        movie.SetImage(new ItemImageInfo { Type = ImageType.Backdrop, Path = "/media/backdrop.jpg" }, 0);
        movie.RemoteTrailers = [new MediaUrl { Url = "https://www.youtube.com/watch?v=M7lc1UVf-VE" }];
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
    [Fact] public void PersonalMediaBarAppearancePersistsWithoutOverridingAdministratorAccessOrSelection()
    {
        using var f = new Fixture();var a=f.User();var b=f.User();
        f.Plugin.Configuration.QoL.MediaBar = new() { Source="recent", ItemCount=2 };
        f.Service.Preferences(a.Id,new() { MediaBarAppearance=new() { Layout="card", BackdropPosition="bottom",Height=95,Source="random",ItemCount=20 },MediaBarTrailerSource="youtube",MediaBarTrailerAutoplay=false,MediaBarTrailerDelay=7 });
        var own=f.Service.MediaBar(a.Id);Assert.Equal("card",own.Settings.Layout);Assert.Equal("bottom",own.Settings.BackdropPosition);Assert.Equal("recent",own.Settings.Source);Assert.Equal(2,own.Settings.ItemCount);Assert.False(own.TrailerAutoplay);Assert.Equal(7,own.TrailerDelay);
        Assert.Equal("banner",f.Service.MediaBar(b.Id).Settings.Layout);
        var restarted=f.NewService();Assert.Equal("card",restarted.MediaBar(a.Id).Settings.Layout);restarted.Dispose();
        f.Plugin.Configuration.QoL.MediaBar.Enabled=false;Assert.False(f.Service.MediaBar(a.Id).Settings.Enabled);
        Assert.Throws<ArgumentException>(()=>f.Service.Preferences(a.Id,new(){MediaBarAppearance=new(){BackdropPosition="arbitrary"}}));
        Assert.Throws<ArgumentException>(()=>f.Service.Preferences(a.Id,new(){MediaBarTrailerSource="arbitrary"}));
        Assert.Throws<ArgumentException>(()=>f.Service.Preferences(a.Id,new(){MediaBarTrailerDelay=16}));
    }
}
