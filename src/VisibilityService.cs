using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace Jellyfin.Plugin.MediaHider;
public sealed record MediaVisibility(Guid ItemId, Guid TargetId, string TargetName, string Type, bool Hidden, bool Inherited, Guid[] GroupIds, string[] GroupNames);
public sealed record MediaEntry(Guid Id, string Name, int? Year, string Type, bool Hidden, bool Missing = false, Guid[]? GroupIds = null, string[]? GroupNames = null);
public sealed record AccountEntry(Guid Id, string Name);
public sealed record GroupInfo(Guid Id, string Name, Guid[] UserIds, DateTime? RevealAtUtc, DateTime? LastRevealAtUtc);
public sealed record GroupSettings(GroupInfo[] Groups, AccountEntry[] Users);
public sealed class VisibilityService(ILibraryManager library, IUserManager users, ILogger<VisibilityService> logger) : BackgroundService
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly SemaphoreSlim _wake = new(0, 1);
    private string? _lastError;
    public string? LastError => _lastError;
    private static PluginConfiguration Config => Plugin.Instance.Configuration;
    private static bool Supported(BaseItem item) => item is Movie or Series;
    private static HashSet<Guid> HiddenIds() => Config.HiddenItemIds.Concat(Config.GroupRules.Select(r => r.ItemId)).ToHashSet();
    private static Guid[] Scope(Guid id) => Config.HiddenItemIds.Contains(id) ? [] : (Config.GroupRules.FirstOrDefault(r => r.ItemId == id)?.GroupIds ?? [])
        .Where(groupId => Config.Groups.Any(g => g.Id == groupId)).Distinct().ToArray();
    private static string[] ScopeNames(Guid[] ids) => Config.Groups.Where(g => ids.Contains(g.Id)).Select(g => g.Name).ToArray();
    private static MediaEntry Entry(BaseItem item, HashSet<Guid> hidden)
    {
        var groups = Scope(item.Id);
        return new(item.Id, item.Name, item.ProductionYear, item is Series ? "Series" : "Movie", hidden.Contains(item.Id), false, groups, ScopeNames(groups));
    }
    public async Task<MediaVisibility?> GetVisibilityAsync(Guid id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var item = library.GetItemById(id);
            if (item is null) return null;
            var target = Supported(item) ? item : item is Season or Episode ? item.GetParents().FirstOrDefault(parent => parent is Series) : null;
            if (target is null) return null;
            var groups = Scope(target.Id);
            return new(item.Id, target.Id, target.Name, target is Series ? "Series" : "Movie", HiddenIds().Contains(target.Id), target.Id != item.Id, groups, ScopeNames(groups));
        }
        finally { _gate.Release(); }
    }
    public async Task<IReadOnlyList<MediaEntry>> SearchAsync(string query, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var hidden = HiddenIds();
            return library.GetItemList(new InternalItemsQuery { Recursive = true, SearchTerm = query.Trim(), Limit = 60,
                IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series] }).Select(item => Entry(item, hidden)).ToArray();
        }
        finally { _gate.Release(); }
    }
    public async Task<IReadOnlyList<MediaEntry>> ListAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var hidden = HiddenIds();
            return hidden.Select(id => library.GetItemById(id) is { } item ? Entry(item, hidden)
                : new MediaEntry(id, "Removed item (" + id + ")", null, "—", true, true, Scope(id), ScopeNames(Scope(id))))
                .OrderBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
        }
        finally { _gate.Release(); }
    }
    public async Task SaveQoLAsync(QoLSettings settings, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var previous = Config.QoL;
            Config.QoL = settings.Validated();
            try { Plugin.Instance.SaveConfiguration(); }
            catch { Config.QoL = previous; throw; }
        }
        finally { _gate.Release(); }
    }
    private BaseItem RequireTitle(Guid id)
    {
        var item = library.GetItemById(id) ?? throw new KeyNotFoundException("Title not found.");
        if (!Supported(item)) throw new ArgumentException("Only movies and entire series can be hidden.");
        return item;
    }
    private async Task SaveAndApplyAsync(Action change, CancellationToken ct)
    {
        var oldIds = Config.HiddenItemIds; var oldGroups = Config.Groups; var oldRules = Config.GroupRules;
        try
        {
            change();
            try { Plugin.Instance.SaveConfiguration(); }
            catch { Config.HiddenItemIds = oldIds; Config.Groups = oldGroups; Config.GroupRules = oldRules; throw; }
            await ReconcileCoreAsync(ct).ConfigureAwait(false);
            _lastError = null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { _lastError = ex.Message; Signal(); throw; }
    }
    public async Task SetHiddenAsync(Guid id, bool hidden, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (hidden) RequireTitle(id);
            await SaveAndApplyAsync(() =>
            {
                Config.HiddenItemIds = hidden ? Config.HiddenItemIds.Append(id).Distinct().ToArray() : Config.HiddenItemIds.Where(i => i != id).ToArray();
                Config.GroupRules = Config.GroupRules.Where(r => r.ItemId != id).ToArray();
            }, ct).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }
    public async Task SetGroupsHiddenAsync(Guid id, Guid[] groupIds, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            RequireTitle(id);
            var ids = groupIds.Distinct().ToArray();
            if (ids.Length == 0 || ids.Any(group => !Config.Groups.Any(g => g.Id == group)))
                throw new ArgumentException("Select at least one existing group, or use hide from all users.");
            await SaveAndApplyAsync(() =>
            {
                Config.HiddenItemIds = Config.HiddenItemIds.Where(i => i != id).ToArray();
                Config.GroupRules = Config.GroupRules.Where(r => r.ItemId != id).Append(new GroupVisibilityRule { ItemId = id, GroupIds = ids }).ToArray();
            }, ct).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }
    public async Task RestoreAllAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try { await SaveAndApplyAsync(() => { Config.HiddenItemIds = []; Config.GroupRules = []; }, ct).ConfigureAwait(false); }
        finally { _gate.Release(); }
    }
    private AccountEntry[] NonAdminAccounts() => users.GetUsers().Where(u => !users.GetUserDto(u).Policy.IsAdministrator)
        .Select(u => new AccountEntry(u.Id, u.Username)).OrderBy(u => u.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
    public async Task<GroupSettings> GetGroupsAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try { return new(Config.Groups.Select(g => new GroupInfo(g.Id, g.Name, g.UserIds.ToArray(), g.RevealAtUtc, g.LastRevealAtUtc)).ToArray(), NonAdminAccounts()); }
        finally { _gate.Release(); }
    }
    public async Task<Guid> SaveGroupAsync(Guid? id, string name, Guid[] userIds, DateTime? revealAtUtc, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            name = name.Trim();
            if (name.Length is < 1 or > 60) throw new ArgumentException("Group names must contain 1 to 60 characters.");
            if (id.HasValue && !Config.Groups.Any(g => g.Id == id)) throw new KeyNotFoundException("Group not found.");
            if (Config.Groups.Any(g => g.Id != id && string.Equals(g.Name, name, StringComparison.OrdinalIgnoreCase))) throw new ArgumentException("A group with that name already exists.");
            var valid = NonAdminAccounts().Select(u => u.Id).ToHashSet();
            if (userIds.Any(u => !valid.Contains(u))) throw new ArgumentException("Groups may contain only existing non-administrator accounts.");
            if (revealAtUtc.HasValue && revealAtUtc.Value.Kind != DateTimeKind.Utc) throw new ArgumentException("The reveal time must use UTC.");
            if (revealAtUtc <= DateTime.UtcNow) throw new ArgumentException("Choose a future reveal date and time.");
            var groupId = id ?? Guid.NewGuid();
            var previous = Config.Groups.FirstOrDefault(g => g.Id == groupId);
            var group = new UserGroup { Id = groupId, Name = name, UserIds = userIds.Distinct().ToArray(), RevealAtUtc = revealAtUtc, LastRevealAtUtc = previous?.LastRevealAtUtc };
            await SaveAndApplyAsync(() => Config.Groups = Config.Groups.Where(g => g.Id != groupId).Append(group).ToArray(), ct).ConfigureAwait(false);
            return groupId;
        }
        finally { _gate.Release(); }
    }
    public async Task DeleteGroupAsync(Guid id, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (!Config.Groups.Any(g => g.Id == id)) throw new KeyNotFoundException("Group not found.");
            await SaveAndApplyAsync(() =>
            {
                Config.Groups = Config.Groups.Where(g => g.Id != id).ToArray();
                var retained = new List<GroupVisibilityRule>(); var global = Config.HiddenItemIds.ToHashSet();
                foreach (var rule in Config.GroupRules)
                {
                    var remaining = rule.GroupIds.Where(group => group != id && Config.Groups.Any(g => g.Id == group)).Distinct().ToArray();
                    // Deleting the final audience falls back to admin-only visibility rather than exposing the title.
                    if (remaining.Length == 0) global.Add(rule.ItemId);
                    else retained.Add(new GroupVisibilityRule { ItemId = rule.ItemId, GroupIds = remaining });
                }
                Config.HiddenItemIds = global.ToArray(); Config.GroupRules = retained.ToArray();
            }, ct).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }
    public async Task<int> RunScheduledRevealsAsync(DateTime nowUtc, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var due = Config.Groups.Where(g => g.RevealAtUtc.HasValue && g.RevealAtUtc <= nowUtc).Select(g => g.Id).ToHashSet();
            if (due.Count == 0) return 0;
            await SaveAndApplyAsync(() =>
            {
                Config.GroupRules = Config.GroupRules.Select(r => new GroupVisibilityRule { ItemId = r.ItemId, GroupIds = r.GroupIds.Where(id => !due.Contains(id)).ToArray() })
                    .Where(r => r.GroupIds.Length > 0).ToArray();
                Config.Groups = Config.Groups.Select(g => due.Contains(g.Id) ? new UserGroup
                { Id = g.Id, Name = g.Name, UserIds = g.UserIds, RevealAtUtc = null, LastRevealAtUtc = nowUtc } : g).ToArray();
            }, ct).ConfigureAwait(false);
            return due.Count;
        }
        finally { _gate.Release(); }
    }
    public async Task ReconcileAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try { await ReconcileCoreAsync(ct).ConfigureAwait(false); _lastError = null; }
        catch (Exception ex) when (ex is not OperationCanceledException) { _lastError = ex.Message; throw; }
        finally { _gate.Release(); }
    }
    private async Task ReconcileCoreAsync(CancellationToken ct)
    {
        foreach (var user in users.GetUsers().ToArray())
        {
            ct.ThrowIfCancellationRequested();
            var policy = users.GetUserDto(user).Policy;
            var desired = VisibilityRules.BlockedTagsFor(policy.BlockedTags, policy.IsAdministrator, Config.Groups.Where(g => g.UserIds.Contains(user.Id)).Select(g => g.Id));
            if (!policy.BlockedTags.SequenceEqual(desired))
            { policy.BlockedTags = desired; await users.UpdatePolicyAsync(user.Id, policy).ConfigureAwait(false); }
        }
        var targets = new Dictionary<Guid, (BaseItem Item, string[] Tags)>();
        foreach (var id in HiddenIds())
        {
            ct.ThrowIfCancellationRequested();
            if (library.GetItemById(id) is not { } item || !Supported(item)) continue;
            var groups = Scope(id);
            string[] required = groups.Length == 0 ? [VisibilityRules.HiddenTag] : groups.Select(VisibilityRules.GroupTag).ToArray();
            targets[item.Id] = (item, required);
            foreach (var child in library.GetItemList(new InternalItemsQuery { Recursive = true, AncestorIds = [id] })) targets[child.Id] = (child, required);
        }
        var tagged = library.GetItemList(new InternalItemsQuery { Recursive = true, Tags = [VisibilityRules.HiddenTag, VisibilityRules.ManagedItemTag] });
        foreach (var item in tagged.Concat(targets.Values.Select(t => t.Item)).DistinctBy(i => i.Id))
        {
            ct.ThrowIfCancellationRequested();
            var desired = VisibilityRules.ItemTagsFor(item.Tags, targets.TryGetValue(item.Id, out var target) ? target.Tags : []);
            if (item.Tags.SequenceEqual(desired)) continue;
            var previous = item.Tags; item.Tags = desired;
            try { await library.UpdateItemAsync(item, item.GetParent(), ItemUpdateType.MetadataEdit, ct).ConfigureAwait(false); }
            catch { item.Tags = previous; throw; }
        }
    }
    internal void Signal() { try { _wake.Release(); } catch (SemaphoreFullException) { } }
    private void OnItemChanged(object? sender, ItemChangeEventArgs args) => Signal();
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        library.ItemAdded += OnItemChanged; library.ItemUpdated += OnItemChanged; library.ItemRemoved += OnItemChanged;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try { await ReconcileAsync(stoppingToken).ConfigureAwait(false); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception ex) { logger.LogError(ex, "Jelly QoL synchronization failed and will be retried."); }
                await _wake.WaitAsync(TimeSpan.FromSeconds(15), stoppingToken).ConfigureAwait(false);
                await Task.Delay(250, stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally { library.ItemAdded -= OnItemChanged; library.ItemUpdated -= OnItemChanged; library.ItemRemoved -= OnItemChanged; }
    }
}
