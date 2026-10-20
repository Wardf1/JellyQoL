using System.Reflection;
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
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
[assembly: CollectionBehavior(DisableTestParallelization = true)]
namespace MediaHider.Tests;
public sealed class VisibilityTests
{
    private sealed class Fixture
    {
        public readonly Mock<ILibraryManager> Library = new();
        public readonly Mock<IUserManager> Users = new();
        public readonly Mock<IXmlSerializer> Xml = new();
        public readonly List<BaseItem> Items = [];
        public readonly List<User> Accounts = [];
        public readonly Dictionary<Guid, UserPolicy> Policies = [];
        public readonly Plugin Plugin;
        public readonly VisibilityService Service;
        public Fixture()
        {
            var paths = new Mock<IApplicationPaths>();
            paths.SetupGet(p => p.PluginConfigurationsPath).Returns(Path.GetTempPath());
            paths.SetupGet(p => p.PluginsPath).Returns(Path.GetTempPath());
            Xml.Setup(x => x.DeserializeFromFile(typeof(PluginConfiguration), It.IsAny<string>())).Throws<FileNotFoundException>();
            Plugin = new Plugin(paths.Object, Xml.Object);
            _ = Plugin.Configuration;
            Library.Setup(x => x.GetItemById(It.IsAny<Guid>())).Returns((Guid id) => Items.Find(i => i.Id == id));
            Library.Setup(x => x.GetItemList(It.IsAny<InternalItemsQuery>())).Returns((InternalItemsQuery q) =>
                (IReadOnlyList<BaseItem>)Items.Where(i =>
                    (q.Tags.Length == 0 || q.Tags.Any(t => i.Tags.Contains(t))) &&
                    (q.AncestorIds.Length == 0 || i.GetParents().Any(p => q.AncestorIds.Contains(p.Id))) &&
                    (q.IncludeItemTypes.Length == 0 || i is Movie or Series) &&
                    (string.IsNullOrEmpty(q.SearchTerm) || i.Name.Contains(q.SearchTerm, StringComparison.OrdinalIgnoreCase)))
                    .Take(q.Limit ?? int.MaxValue).ToArray());
            Library.Setup(x => x.UpdateItemAsync(It.IsAny<BaseItem>(), It.IsAny<BaseItem>(), It.IsAny<ItemUpdateType>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            BaseItem.LibraryManager = Library.Object;
            Users.Setup(x => x.GetUsers()).Returns(Accounts);
            Users.Setup(x => x.GetUserDto(It.IsAny<User>(), It.IsAny<string?>())).Returns((User u, string? _) => new UserDto { Id = u.Id, Policy = Policies[u.Id] });
            Users.Setup(x => x.UpdatePolicyAsync(It.IsAny<Guid>(), It.IsAny<UserPolicy>())).Returns(Task.CompletedTask);
            Service = new VisibilityService(Library.Object, Users.Object, NullLogger<VisibilityService>.Instance);
        }
        public User AddUser(bool admin = false)
        {
            var u = new User(Guid.NewGuid().ToString(), "auth", "reset"); Accounts.Add(u);
            Policies[u.Id] = new UserPolicy { IsAdministrator = admin, BlockedTags = ["existing-block"] };
            return u;
        }
        public T Add<T>(string name, BaseItem? parent = null) where T : BaseItem, new()
        {
            var item = new T { Id = Guid.NewGuid(), Name = name, Tags = ["original-tag"], ParentId = parent?.Id ?? Guid.Empty };
            Items.Add(item); return item;
        }
    }
    [Fact]
    public async Task HidesMovieAndAllSeriesDescendantsAndKeepsAdminAccess()
    {
        var f = new Fixture(); var user = f.AddUser(); var admin = f.AddUser(true);
        var movie = f.Add<Movie>("Movie"); var series = f.Add<Series>("Show");
        var season = f.Add<Season>("Season", series); var episode = f.Add<Episode>("Episode", season);
        var other = f.Add<Movie>("Other");
        await f.Service.SetHiddenAsync(movie.Id, true, default);
        await f.Service.SetHiddenAsync(series.Id, true, default);
        foreach (var item in new BaseItem[] { movie, series, season, episode }) Assert.Contains(VisibilityRules.HiddenTag, item.Tags);
        Assert.DoesNotContain(VisibilityRules.HiddenTag, other.Tags);
        Assert.Contains(VisibilityRules.HiddenTag, f.Policies[user.Id].BlockedTags);
        Assert.DoesNotContain(VisibilityRules.HiddenTag, f.Policies[admin.Id].BlockedTags);
        Assert.Contains("existing-block", f.Policies[user.Id].BlockedTags);
    }
    [Fact]
    public async Task RestoreRemovesOnlyOwnTagsAndDoesNotTouchOtherHiddenTitles()
    {
        var f = new Fixture(); f.AddUser();
        var a = f.Add<Series>("A"); var ep = f.Add<Episode>("Ep", a); var b = f.Add<Movie>("B");
        await f.Service.SetHiddenAsync(a.Id, true, default); await f.Service.SetHiddenAsync(b.Id, true, default);
        await f.Service.SetHiddenAsync(a.Id, false, default);
        Assert.Equal(new[] { "original-tag" }, a.Tags); Assert.Equal(new[] { "original-tag" }, ep.Tags);
        Assert.Contains(VisibilityRules.HiddenTag, b.Tags);
        await f.Service.RestoreAllAsync(default);
        Assert.All(f.Items, item => Assert.Equal(new[] { "original-tag" }, item.Tags));
        Assert.Empty(f.Plugin.Configuration.HiddenItemIds);
    }
    [Fact]
    public async Task ReconcileHandlesNewEpisodesUsersPromotionsAndMetadataRefresh()
    {
        var f = new Fixture(); var user = f.AddUser(); var series = f.Add<Series>("Show");
        await f.Service.SetHiddenAsync(series.Id, true, default);
        var episode = f.Add<Episode>("New", series); var newUser = f.AddUser();
        series.Tags = ["refreshed-tag"];
        f.Policies[user.Id].IsAdministrator = true;
        await f.Service.ReconcileAsync(default);
        Assert.Contains(VisibilityRules.HiddenTag, episode.Tags);
        Assert.Contains("refreshed-tag", series.Tags);
        Assert.Contains(VisibilityRules.HiddenTag, series.Tags);
        Assert.Contains(VisibilityRules.HiddenTag, f.Policies[newUser.Id].BlockedTags);
        Assert.DoesNotContain(VisibilityRules.HiddenTag, f.Policies[user.Id].BlockedTags);
    }
    [Fact]
    public async Task RepeatedHideIsIdempotentAndUnknownAndEpisodeIdsAreRejected()
    {
        var f = new Fixture(); f.AddUser(); var movie = f.Add<Movie>("Movie");
        await f.Service.SetHiddenAsync(movie.Id, true, default); await f.Service.SetHiddenAsync(movie.Id, true, default);
        Assert.Single(f.Plugin.Configuration.HiddenItemIds); Assert.Equal(1, movie.Tags.Count(t => t == VisibilityRules.HiddenTag));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => f.Service.SetHiddenAsync(Guid.NewGuid(), true, default));
        await Assert.ThrowsAsync<ArgumentException>(() => f.Service.SetHiddenAsync(f.Add<Episode>("Ep").Id, true, default));
    }
    [Fact]
    public async Task FailedLibraryWriteRetainsSavedIntentAndRetryRepairsIt()
    {
        var f = new Fixture(); f.AddUser(); var movie = f.Add<Movie>("Movie");
        f.Library.Setup(x => x.UpdateItemAsync(It.IsAny<BaseItem>(), It.IsAny<BaseItem>(), It.IsAny<ItemUpdateType>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException("write failed"));
        await Assert.ThrowsAsync<IOException>(() => f.Service.SetHiddenAsync(movie.Id, true, default));
        Assert.Contains(movie.Id, f.Plugin.Configuration.HiddenItemIds);
        Assert.DoesNotContain(VisibilityRules.HiddenTag, movie.Tags);
        f.Library.Setup(x => x.UpdateItemAsync(It.IsAny<BaseItem>(), It.IsAny<BaseItem>(), It.IsAny<ItemUpdateType>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        await f.Service.ReconcileAsync(default);
        Assert.Contains(VisibilityRules.HiddenTag, movie.Tags); Assert.Null(f.Service.LastError);
    }
    [Fact]
    public async Task FailedConfigWriteDoesNotChangeIntentOrMedia()
    {
        var f = new Fixture(); f.AddUser(); var movie = f.Add<Movie>("Movie");
        f.Xml.Setup(x => x.SerializeToFile(It.IsAny<object>(), It.IsAny<string>())).Throws(new IOException("disk full"));
        await Assert.ThrowsAsync<IOException>(() => f.Service.SetHiddenAsync(movie.Id, true, default));
        Assert.Empty(f.Plugin.Configuration.HiddenItemIds); Assert.Equal(new[] { "original-tag" }, movie.Tags);
    }
    [Fact]
    public async Task DeletedHiddenItemCanBeListedAndRemoved()
    {
        var f = new Fixture(); var movie = f.Add<Movie>("Movie");
        await f.Service.SetHiddenAsync(movie.Id, true, default); f.Items.Clear();
        Assert.True(Assert.Single(await f.Service.ListAsync(default)).Missing);
        await f.Service.SetHiddenAsync(movie.Id, false, default); Assert.Empty(await f.Service.ListAsync(default));
    }
    [Fact]
    public void ControllerRequiresAdminForEveryEndpointAndEmbeddedPageExists()
    {
        var attr = typeof(MediaHiderController).GetCustomAttribute<AuthorizeAttribute>();
        Assert.Equal("RequiresElevation", attr?.Policy);
        Assert.All(typeof(MediaHiderController).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly), m => Assert.Null(m.GetCustomAttribute<AllowAnonymousAttribute>()));
        var f = new Fixture();
        Assert.NotNull(typeof(Plugin).Assembly.GetManifestResourceStream(f.Plugin.GetPages().Single().EmbeddedResourcePath));
    }
    [Fact]
    public async Task ConcurrentChangesDoNotLoseHiddenTitles()
    {
        var f = new Fixture(); f.AddUser(); var a = f.Add<Movie>("A"); var b = f.Add<Movie>("B");
        await Task.WhenAll(f.Service.SetHiddenAsync(a.Id, true, default), f.Service.SetHiddenAsync(b.Id, true, default));
        Assert.Equal(2, f.Plugin.Configuration.HiddenItemIds.Length);
        Assert.Contains(VisibilityRules.HiddenTag, a.Tags); Assert.Contains(VisibilityRules.HiddenTag, b.Tags);
    }
    [Fact]
    public void ExistingTagsArePreservedExactly()
    {
        var original = new[] { "Kids", "kids", "tag" };
        Assert.Equal(original, VisibilityRules.TagsFor(VisibilityRules.TagsFor(original, true), false));
    }
    [Fact]
    public async Task VisibilityStatusResolvesSeriesForEpisodesAndRejectsUnknownItems()
    {
        var f = new Fixture(); var series = f.Add<Series>("Show"); var season = f.Add<Season>("Season", series);
        var episode = f.Add<Episode>("Episode", season);
        await f.Service.SetHiddenAsync(series.Id, true, default);
        var inherited = await f.Service.GetVisibilityAsync(episode.Id, default);
        Assert.NotNull(inherited); Assert.True(inherited.Inherited); Assert.True(inherited.Hidden);
        Assert.Equal(series.Id, inherited.TargetId); Assert.Equal("Series", inherited.Type);
        var direct = await f.Service.GetVisibilityAsync(series.Id, default);
        Assert.NotNull(direct); Assert.False(direct.Inherited);
        Assert.Null(await f.Service.GetVisibilityAsync(Guid.NewGuid(), default));
        Assert.Null(await f.Service.GetVisibilityAsync(f.Add<Folder>("Folder").Id, default));
    }
    [Fact]
    public async Task GroupHidingBlocksOnlyMembersAndAlwaysKeepsAdministratorsVisible()
    {
        var f = new Fixture(); var a = f.AddUser(); var b = f.AddUser(); var admin = f.AddUser(true); var movie = f.Add<Movie>("Private");
        var group = await f.Service.SaveGroupAsync(null, "Group A", [a.Id], null, default);
        await f.Service.SetGroupsHiddenAsync(movie.Id, [group], default);
        Assert.Contains(VisibilityRules.GroupTag(group), movie.Tags); Assert.DoesNotContain(VisibilityRules.HiddenTag, movie.Tags);
        Assert.Contains(VisibilityRules.GroupTag(group), f.Policies[a.Id].BlockedTags);
        Assert.DoesNotContain(VisibilityRules.GroupTag(group), f.Policies[b.Id].BlockedTags);
        Assert.DoesNotContain(VisibilityRules.GroupTag(group), f.Policies[admin.Id].BlockedTags);
        var status = await f.Service.GetVisibilityAsync(movie.Id, default);
        Assert.Equal(new[] { group }, status!.GroupIds); Assert.Equal(new[] { "Group A" }, status.GroupNames);
    }
    [Fact]
    public async Task ChangingMembershipAndDeletingFinalGroupCleanUpOwnTagsAndFallBackToAdminOnly()
    {
        var f = new Fixture(); var a = f.AddUser(); var b = f.AddUser(); var movie = f.Add<Movie>("Movie");
        var group = await f.Service.SaveGroupAsync(null, "Group", [a.Id], null, default);
        await f.Service.SetGroupsHiddenAsync(movie.Id, [group], default);
        await f.Service.SaveGroupAsync(group, "Renamed", [b.Id], null, default);
        Assert.DoesNotContain(VisibilityRules.GroupTag(group), f.Policies[a.Id].BlockedTags);
        Assert.Contains(VisibilityRules.GroupTag(group), f.Policies[b.Id].BlockedTags);
        await f.Service.DeleteGroupAsync(group, default);
        Assert.Empty(f.Plugin.Configuration.Groups); Assert.Empty(f.Plugin.Configuration.GroupRules);
        Assert.Contains(movie.Id, f.Plugin.Configuration.HiddenItemIds);
        Assert.Contains(VisibilityRules.HiddenTag, movie.Tags); Assert.DoesNotContain(VisibilityRules.GroupTag(group), movie.Tags);
        Assert.DoesNotContain(VisibilityRules.GroupTag(group), f.Policies[b.Id].BlockedTags);
    }
    [Fact]
    public async Task EachGroupRevealsAtItsOwnTimeAndDoesNotRevealGlobalRestrictions()
    {
        var f = new Fixture(); var a = f.AddUser(); var b = f.AddUser(); var series = f.Add<Series>("Show"); var ep = f.Add<Episode>("Ep", series); var global = f.Add<Movie>("Admin only");
        var start = DateTime.UtcNow;
        var ga = await f.Service.SaveGroupAsync(null, "A", [a.Id], start.AddHours(1), default);
        var gb = await f.Service.SaveGroupAsync(null, "B", [b.Id], start.AddHours(2), default);
        await f.Service.SetGroupsHiddenAsync(series.Id, [ga, gb], default); await f.Service.SetHiddenAsync(global.Id, true, default);
        Assert.Equal(0, await f.Service.RunScheduledRevealsAsync(start.AddMinutes(30), default));
        Assert.Equal(1, await f.Service.RunScheduledRevealsAsync(start.AddMinutes(90), default));
        Assert.DoesNotContain(VisibilityRules.GroupTag(ga), series.Tags); Assert.DoesNotContain(VisibilityRules.GroupTag(ga), ep.Tags);
        Assert.Contains(VisibilityRules.GroupTag(gb), series.Tags); Assert.Contains(VisibilityRules.GroupTag(gb), ep.Tags);
        Assert.Null(f.Plugin.Configuration.Groups.Single(g => g.Id == ga).RevealAtUtc);
        Assert.NotNull(f.Plugin.Configuration.Groups.Single(g => g.Id == ga).LastRevealAtUtc);
        Assert.NotNull(f.Plugin.Configuration.Groups.Single(g => g.Id == gb).RevealAtUtc);
        Assert.Equal(0, await f.Service.RunScheduledRevealsAsync(start.AddMinutes(95), default));
        Assert.Equal(1, await f.Service.RunScheduledRevealsAsync(start.AddHours(3), default));
        Assert.Equal(new[] { "original-tag" }, series.Tags); Assert.Equal(new[] { "original-tag" }, ep.Tags);
        Assert.Contains(VisibilityRules.HiddenTag, global.Tags);
    }
    [Fact]
    public async Task GroupValidationRejectsAdminsUnknownMembersAndPastSchedules()
    {
        var f = new Fixture(); var admin = f.AddUser(true); var user = f.AddUser();
        await Assert.ThrowsAsync<ArgumentException>(() => f.Service.SaveGroupAsync(null, "Bad", [admin.Id], null, default));
        await Assert.ThrowsAsync<ArgumentException>(() => f.Service.SaveGroupAsync(null, "Bad", [Guid.NewGuid()], null, default));
        await Assert.ThrowsAsync<ArgumentException>(() => f.Service.SaveGroupAsync(null, "Bad", [user.Id], DateTime.UtcNow.AddMinutes(-1), default));
        await f.Service.SaveGroupAsync(null, "A", [user.Id], null, default);
        await Assert.ThrowsAsync<ArgumentException>(() => f.Service.SaveGroupAsync(null, "a", [user.Id], null, default));
        await Assert.ThrowsAsync<ArgumentException>(() => f.Service.SetGroupsHiddenAsync(f.Add<Movie>("Movie").Id, [], default));
    }
    [Fact]
    public async Task GlobalHideAndRestoreOverrideAnyGroupAudienceWithoutLeavingTags()
    {
        var f = new Fixture(); var user = f.AddUser(); var item = f.Add<Movie>("Movie");
        var group = await f.Service.SaveGroupAsync(null, "A", [user.Id], null, default);
        await f.Service.SetGroupsHiddenAsync(item.Id, [group], default); await f.Service.SetHiddenAsync(item.Id, true, default);
        Assert.Empty(f.Plugin.Configuration.GroupRules); Assert.Contains(VisibilityRules.HiddenTag, item.Tags); Assert.DoesNotContain(VisibilityRules.GroupTag(group), item.Tags);
        await f.Service.SetGroupsHiddenAsync(item.Id, [group], default); await f.Service.RestoreAllAsync(default);
        Assert.Equal(new[] { "original-tag" }, item.Tags); Assert.Empty(f.Plugin.Configuration.HiddenItemIds); Assert.Empty(f.Plugin.Configuration.GroupRules);
    }
    [Fact]
    public async Task QoLPreferencesDoNotModifyHiddenTitlesAndRollbackOnSaveFailure()
    {
        var f = new Fixture(); var id = Guid.NewGuid();
        f.Plugin.Configuration.HiddenItemIds = [id];
        await f.Service.SaveQoLAsync(new QoLSettings { EnableFilterWarnings = false, AnimateFilterWarnings = false }, default);
        Assert.False(f.Plugin.Configuration.QoL.EnableFilterWarnings); Assert.Contains(id, f.Plugin.Configuration.HiddenItemIds);
        f.Xml.Setup(x => x.SerializeToFile(It.IsAny<object>(), It.IsAny<string>())).Throws(new IOException("test failure"));
        await Assert.ThrowsAsync<IOException>(() => f.Service.SaveQoLAsync(new QoLSettings(), default));
        Assert.False(f.Plugin.Configuration.QoL.EnableFilterWarnings);
    }
}
