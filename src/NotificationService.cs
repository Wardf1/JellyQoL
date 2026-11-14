using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace Jellyfin.Plugin.MediaHider;
public sealed partial class NotificationService : BackgroundService
{
    private readonly ILibraryManager _library;
    private readonly IUserManager _users;
    private readonly ILogger<NotificationService> _logger;
    private readonly string _path;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ConcurrentDictionary<Guid, DateTime> _added = new();
    private NotificationData _data;
    public NotificationService(ILibraryManager library, IUserManager users, IApplicationPaths paths, ILogger<NotificationService> logger)
    {
        _library = library; _users = users; _logger = logger;
        _path = Path.Combine(paths.PluginConfigurationsPath, "JellyQoL.notifications.json");
        // A damaged store must fail visibly rather than replaying all notifications or resetting secrets.
        _data = File.Exists(_path) ? JsonSerializer.Deserialize<NotificationData>(File.ReadAllText(_path)) ?? throw new InvalidDataException("Empty notification store.") : new();
    }
    private void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(_data));
        File.Move(temporary, _path, true);
    }
    private T Locked<T>(Func<T> action)
    {
        _gate.Wait();
        var previous = JsonSerializer.Serialize(_data);
        try { return action(); }
        catch { _data = JsonSerializer.Deserialize<NotificationData>(previous)!; throw; }
        finally { _gate.Release(); }
    }
    private NotificationAccount Account(Guid userId)
    {
        if (userId == Guid.Empty || _users.GetUserById(userId) is null) throw new UnauthorizedAccessException();
        if (!_data.Accounts.TryGetValue(userId, out var account)) { account = new(); _data.Accounts[userId] = account; }
        return account;
    }
    public void RegisterAccounts() => Locked(() => { foreach (var user in _users.GetUsers()) Account(user.Id); Save(); return true; });
    public NotificationOptions Options() => Locked(() => JsonSerializer.Deserialize<NotificationOptions>(JsonSerializer.Serialize(_data.Options))!);
    public void Configure(NotificationOptions value) => Locked(() => {
        value.Validated();
        if (value.AccountMappings.Values.Any(id => _users.GetUserById(id) is null)) throw new ArgumentException("Unknown Jellyfin account.");
        value.Secret = _data.Options.Secret.Length > 0 ? _data.Options.Secret : Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        if (value.Enabled && !_data.Options.Enabled) {
            _data.Activated = DateTime.UtcNow; _added.Clear();
            _data.KnownSeries = _library.GetItemList(new InternalItemsQuery { Recursive = true, IncludeItemTypes = [BaseItemKind.Series] }).Select(x => x.Id).ToHashSet();
            _data.NewSeriesUntil.Clear();
            foreach (var user in _users.GetUsers()) Account(user.Id);
        }
        _data.Options = value; Save(); return true;
    });
    public string RotateSecret() => Locked(() => { _data.Options.Secret = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(); Save(); return _data.Options.Secret; });
    public bool AcceptSecret(string supplied) => Locked(() => _data.Options.Enabled && _data.Options.Seerr && supplied.Length <= 256 && _data.Options.Secret.Length >= 32 &&
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(supplied)), SHA256.HashData(Encoding.UTF8.GetBytes(_data.Options.Secret))));
    public object Diagnostics() => Locked(() => (object)new { _data.LastWebhook, _data.LastWebhookStatus,
        Waiting = _data.Requests.Count(x => x.Status == "waiting"), Ready = _data.Requests.Count(x => x.Status == "ready"),
        Requests = _data.Requests.OrderByDescending(x => x.Received).Take(30).Select(x => new { x.RequestId, x.MediaType, x.Received, x.Status }).ToArray() });
    public void Receive(JsonElement payload) => Locked(() => {
        var request = SeerrWebhook.Parse(payload);
        _data.LastWebhook = DateTime.UtcNow;
        _data.LastWebhookStatus = request is null ? "test" : "received";
        if (request is not null && !_data.Requests.Any(x => x.Key == request.Key)) {
            if (_data.Requests.Count >= 5000) throw new ArgumentException("Webhook queue is full.");
            _data.Requests.Add(request);
        }
        Save(); return true;
    });
    public void WebhookError() => Locked(() => { _data.LastWebhook = DateTime.UtcNow; _data.LastWebhookStatus = "error"; Save(); return true; });
    public void QueueItem(BaseItem item)
    {
        if (item is Movie or Episode && !item.IsVirtualItem) _added[item.Id] = DateTime.UtcNow;
    }
    private void OnAdded(object? sender, ItemChangeEventArgs args) { if (_data.Options.Enabled && _data.Options.Library) QueueItem(args.Item); }
    private static bool Playable(BaseItem? item) => item is Movie or Episode && !item.IsVirtualItem && !string.IsNullOrWhiteSpace(item.Path);
    private void Record(BaseItem item, bool seerr, bool library, Guid? requester = null)
    {
        var record = _data.Records.FirstOrDefault(x => x.ItemId == item.Id);
        if (record is null) {
            var series = item is Episode ? item.GetParents().OfType<Series>().FirstOrDefault() : null;
            if (series is not null && _data.KnownSeries.Add(series.Id)) _data.NewSeriesUntil[series.Id] = DateTime.UtcNow.AddMinutes(10);
            record = new() { ItemId = item.Id, NewSeries = series is not null && _data.NewSeriesUntil.TryGetValue(series.Id, out var until) && until > DateTime.UtcNow }; _data.Records.Add(record);
        }
        record.Seerr |= seerr; record.Library |= library;
        if (requester.HasValue && !record.RequestedBy.Contains(requester.Value)) record.RequestedBy.Add(requester.Value);
    }
    public void ProcessPending() => Locked(() => {
        if (!_data.Options.Enabled) return false;
        foreach (var entry in _added.ToArray()) {
            if (DateTime.UtcNow - entry.Value < TimeSpan.FromSeconds(30) || _library.IsScanRunning) continue;
            if (_data.Options.Library && _library.GetItemById(entry.Key) is { } item && Playable(item)) Record(item, false, true);
            _added.TryRemove(entry.Key, out _);
        }
        foreach (var request in _data.Requests.Where(x => x.Status == "waiting")) {
            var matches = Resolve(request).Where(Playable).ToArray();
            if (matches.Length == 0) continue;
            var requester = request.RequestedBy;
            if (!requester.HasValue && _data.Options.AccountMappings.TryGetValue(request.RequesterId, out var mapped)) requester = mapped;
            foreach (var item in matches) Record(item, true, false, requester);
            request.MatchedIds = matches.Select(x => x.Id).ToArray(); request.Status = "ready";
            _data.LastWebhookStatus = "ready";
        }
        Prune(); Save(); return true;
    });
    private IEnumerable<BaseItem> Resolve(PendingRequest request)
    {
        var title = request.ItemId.HasValue ? _library.GetItemById(request.ItemId.Value) : null;
        var expected = request.MediaType == "movie" ? BaseItemKind.Movie : BaseItemKind.Series;
        if (title is not Movie && title is not Series) {
            if (string.IsNullOrEmpty(request.TmdbId) && string.IsNullOrEmpty(request.TvdbId)) return [];
            title = _library.GetItemList(new InternalItemsQuery { Recursive = true, IncludeItemTypes = [expected],
                HasAnyProviderId = new Dictionary<string, string> { ["Tmdb"] = request.TmdbId, ["Tvdb"] = request.TvdbId }.Where(x => !string.IsNullOrEmpty(x.Value)).ToDictionary(x => x.Key, x => x.Value) }).FirstOrDefault();
        }
        if (title is Movie && request.MediaType == "movie") return [title];
        if (title is not Series series || request.MediaType != "tv") return [];
        var seasons = request.Seasons.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(x => int.TryParse(x, out var n) ? n : -1).Where(x => x >= 0).ToArray();
        var episodes = _library.GetItemList(new InternalItemsQuery { Recursive = true, AncestorIds = [series.Id], IncludeItemTypes = [BaseItemKind.Episode], IsVirtualItem = false });
        // Never announce every old episode of an existing series for a later request.
        return episodes.Where(x => (seasons.Length == 0 || x.ParentIndexNumber.HasValue && seasons.Contains(x.ParentIndexNumber.Value)) &&
            (seasons.Length > 0 || x.DateCreated >= request.Received.AddMinutes(-10) || _data.Records.Any(r => r.ItemId == x.Id && r.Created >= request.Received.AddMinutes(-10))));
    }
    private void Prune()
    {
        var cutoff = DateTime.UtcNow.AddDays(-_data.Options.RetentionDays);
        _data.Records = _data.Records.Where(x => x.Created >= cutoff).OrderByDescending(x => x.Created).Take(10000).ToList();
        _data.Requests.RemoveAll(x => x.Received < cutoff);
        var ids = _data.Records.Select(x => x.Id).ToHashSet();
        foreach (var account in _data.Accounts.Values) {
            account.Shown.IntersectWith(ids); account.Read.IntersectWith(ids);
            foreach (var id in account.Deferred.Keys.Where(x => !ids.Contains(x)).ToArray()) account.Deferred.Remove(id);
        }
        foreach (var id in _data.Accounts.Keys.Where(x => _users.GetUserById(x) is null).ToArray()) _data.Accounts.Remove(id);
    }
    private bool Visible(BaseItem item, User user)
    {
        if (_library.GetItemById<BaseItem>(item.Id, user) is null) return false;
        var policy = _users.GetUserDto(user).Policy;
        // Standalone visibility can succeed for an unassociated folder. Check the physical
        // library roots too, and fail closed when a restricted account has no matching library.
        var blockedFolders = policy.BlockedMediaFolders ?? []; var enabledFolders = policy.EnabledFolders ?? [];
        if (!policy.EnableAllFolders || blockedFolders.Length > 0) {
            static string Normalize(string path) => path.Replace('\\', '/').TrimEnd('/');
            var path = Normalize(item.Path);
            var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
            var libraries = _library.GetVirtualFolders().Where(folder => folder.Locations.Any(root =>
                string.Equals(path, Normalize(root), comparison) || path.StartsWith(Normalize(root) + "/", comparison)));
            if (!libraries.Any(folder => !blockedFolders.Any(id => Guid.TryParse(folder.ItemId, out var libraryId) && id == libraryId) &&
                (policy.EnableAllFolders || enabledFolders.Any(id => Guid.TryParse(folder.ItemId, out var libraryId) && id == libraryId)))) return false;
        }
        if (policy.IsAdministrator) return true;
        var target = item is Episode ? item.GetParents().OfType<Series>().FirstOrDefault()?.Id ?? item.Id : item.Id;
        var config = Plugin.Instance.Configuration;
        return !config.HiddenItemIds.Contains(target) && !config.GroupRules.Any(rule => rule.ItemId == target &&
            rule.GroupIds.Any(group => config.Groups.Any(g => g.Id == group && g.UserIds.Contains(user.Id))));
    }
    private (NotificationRecord Record, BaseItem Item)[] Eligible(Guid userId)
    {
        var user = _users.GetUserById(userId) ?? throw new UnauthorizedAccessException();
        var account = Account(userId); var p = account.Preferences; var options = _data.Options;
        if (!options.Enabled || !p.Enabled) return [];
        return _data.Records.Where(r => r.Created >= account.Since && r.Created >= DateTime.UtcNow.AddDays(-options.RetentionDays) &&
            ((options.Library && p.Library && r.Library) || (options.Seerr && p.Seerr && r.Seerr && (!p.OnlyOwnRequests || r.RequestedBy.Contains(userId)))))
            .Select(r => (Record: r, Item: _library.GetItemById(r.ItemId))).Where(x => x.Item is not null && Playable(x.Item) && Visible(x.Item, user) &&
                (x.Item is Movie ? p.Movies : x.Record.NewSeries ? p.Series : p.Episodes)).Select(x => (x.Record, x.Item!)).ToArray();
    }
    public NotificationFeed Feed(Guid userId, bool popup = false, int offset = 0) => Locked(() => {
        var newAccount = !_data.Accounts.ContainsKey(userId); var account = Account(userId); var eligible = Eligible(userId);
        var unread = eligible.Count(x => !account.Read.Contains(x.Record.Id));
        var items = eligible.Where(x => !popup || (account.Preferences.Popups && !account.Shown.Contains(x.Record.Id) &&
            (!account.Deferred.TryGetValue(x.Record.Id, out var until) || until <= DateTime.UtcNow)))
            .GroupBy(x => x.Item is Episode episode ? episode.SeriesId : x.Item.Id)
            .Select(group => {
                var first = group.First(); var series = first.Item is Episode ep ? ep.GetParents().OfType<Series>().FirstOrDefault() : null;
                return new NotificationEntry(group.Select(x => x.Record.Id).ToArray(), series?.Id ?? first.Item.Id, series?.Id ?? first.Item.Id,
                    series?.Name ?? first.Item.Name, first.Item is Movie ? "Movie" : group.Any(x => x.Record.NewSeries) ? "Series" : "Episode", group.Count(), group.Max(x => x.Record.Created),
                    group.Any(x => x.Record.Seerr), group.Any(x => x.Record.Library), group.All(x => account.Shown.Contains(x.Record.Id)), group.All(x => account.Read.Contains(x.Record.Id)));
            }).OrderByDescending(x => x.Created).Skip(Math.Clamp(offset, 0, 10000)).Take(popup ? 20 : 50).ToArray();
        if (newAccount) Save(); return new NotificationFeed(account.Preferences, _data.Options.Enabled,
            _data.Options.AccountMappings.ContainsValue(userId) || _data.Records.Any(x => x.RequestedBy.Contains(userId)), unread, items) { MediaBarDefaults = Plugin.Instance.Configuration.QoL.MediaBar with { } };
    });
    public void Preferences(Guid userId, NotificationPreferences preferences) => Locked(() => {
        preferences.MediaBarAppearance?.Validated();
        if (preferences.MediaBarTrailerSource is not ("auto" or "local" or "youtube") || preferences.MediaBarTrailerDelay is < 0 or > 15)
            throw new ArgumentException("Invalid trailer settings.");
        var hidden = preferences.HiddenHeaderLibraryIds ?? [];
        if (hidden.Length > 1000 || hidden.Any(id => id == Guid.Empty)) throw new ArgumentException("Invalid header library selection.");
        preferences.HiddenHeaderLibraryIds = hidden.Distinct().ToArray();
        Account(userId).Preferences = preferences; Save(); return true;
    });
    public void ClearHistory(Guid userId) => Locked(() => {
        var account = Account(userId);
        account.Since = DateTime.UtcNow;
        account.Shown.Clear(); account.Read.Clear(); account.Deferred.Clear();
        Save(); return true;
    });
    public Guid[] Act(Guid userId, NotificationAction action) => Locked(() => {
        if (action.Ids.Length > 1000 || action.Action is not ("shown" or "read" or "later" or "claim" or "release")) throw new ArgumentException("Invalid notification action.");
        var account = Account(userId); var allowed = Eligible(userId).Select(x => x.Record.Id).ToHashSet();
        var ids = action.Ids.Distinct().Where(allowed.Contains).ToArray();
        if (action.Action == "claim") ids = ids.Where(id => !account.Shown.Contains(id) && (!account.Deferred.TryGetValue(id, out var until) || until <= DateTime.UtcNow)).ToArray();
        foreach (var id in ids) {
            if (action.Action == "read") account.Read.Add(id);
            if (action.Action is "shown" or "claim" or "read") account.Shown.Add(id);
            if (action.Action == "release" && !account.Read.Contains(id)) account.Shown.Remove(id);
            if (action.Action == "later") { account.Shown.Remove(id); account.Deferred[id] = DateTime.UtcNow.AddHours(1); }
        }
        Save(); return ids;
    });
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        RegisterAccounts(); _library.ItemAdded += OnAdded;
        try {
            while (!stoppingToken.IsCancellationRequested) {
                try { ProcessPending(); } catch (Exception ex) { _logger.LogError(ex, "Jelly QoL notification processing failed"); try { WebhookError(); } catch (IOException) { } }
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken).ConfigureAwait(false);
            }
        } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally { _library.ItemAdded -= OnAdded; }
    }
}
