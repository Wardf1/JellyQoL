using System.Text.Json;
namespace Jellyfin.Plugin.MediaHider;
public sealed class NotificationOptions
{
    public bool Enabled { get; set; }
    public bool Seerr { get; set; } = true;
    public bool Library { get; set; } = true;
    public int RetentionDays { get; set; } = 30;
    public string Secret { get; set; } = string.Empty;
    public Dictionary<string, Guid> AccountMappings { get; set; } = [];
    public NotificationOptions Validated()
    {
        if (RetentionDays is < 1 or > 365 || AccountMappings is null || AccountMappings.Count > 1000 || AccountMappings.Any(x => x.Key.Length > 64 || x.Value == Guid.Empty))
            throw new ArgumentException("Invalid notification settings.");
        return this;
    }
}
public sealed class NotificationPreferences
{
    public bool Enabled { get; set; } = true;
    public bool Popups { get; set; } = true;
    public bool Seerr { get; set; } = true;
    public bool Library { get; set; } = true;
    public bool Movies { get; set; } = true;
    public bool Series { get; set; } = true;
    public bool Episodes { get; set; } = true;
    public bool OnlyOwnRequests { get; set; }
    public bool HideHeaderLibraries { get; set; }
    public Guid[] HiddenHeaderLibraryIds { get; set; } = [];
    public bool FavoritesAsIcon { get; set; } = true;
    public bool MediaBarTrailers { get; set; }
    public string MediaBarTrailerSource { get; set; } = "auto";
    public bool MediaBarTrailerAutoplay { get; set; } = true;
    public int MediaBarTrailerDelay { get; set; } = 2;
    public MediaBarSettings? MediaBarAppearance { get; set; }
}
public sealed class NotificationRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ItemId { get; set; }
    public DateTime Created { get; set; } = DateTime.UtcNow;
    public bool Seerr { get; set; }
    public bool Library { get; set; }
    public bool NewSeries { get; set; }
    public List<Guid> RequestedBy { get; set; } = [];
}
public sealed class NotificationAccount
{
    public DateTime Since { get; set; } = DateTime.UtcNow;
    public NotificationPreferences Preferences { get; set; } = new();
    public HashSet<Guid> Shown { get; set; } = [];
    public HashSet<Guid> Read { get; set; } = [];
    public Dictionary<Guid, DateTime> Deferred { get; set; } = [];
}
public sealed class PendingRequest
{
    public string Key { get; set; } = string.Empty;
    public DateTime Received { get; set; } = DateTime.UtcNow;
    public Guid? ItemId { get; set; }
    public Guid? RequestedBy { get; set; }
    public string RequesterId { get; set; } = string.Empty;
    public string TmdbId { get; set; } = string.Empty;
    public string TvdbId { get; set; } = string.Empty;
    public string MediaType { get; set; } = string.Empty;
    public string RequestId { get; set; } = string.Empty;
    public string Seasons { get; set; } = string.Empty;
    public string Status { get; set; } = "waiting";
    public Guid[] MatchedIds { get; set; } = [];
}
public sealed class NotificationData
{
    public DateTime? Activated { get; set; }
    public NotificationOptions Options { get; set; } = new();
    public List<NotificationRecord> Records { get; set; } = [];
    public Dictionary<Guid, NotificationAccount> Accounts { get; set; } = [];
    public List<PendingRequest> Requests { get; set; } = [];
    public DateTime? LastWebhook { get; set; }
    public string LastWebhookStatus { get; set; } = "none";
    public HashSet<Guid> KnownSeries { get; set; } = [];
    public Dictionary<Guid, DateTime> NewSeriesUntil { get; set; } = [];
}
public sealed record NotificationEntry(Guid[] Ids, Guid ItemId, Guid ImageItemId, string Name, string Type, int Count, DateTime Created, bool Seerr, bool Library, bool Shown, bool Read);
public sealed record NotificationFeed(NotificationPreferences Preferences, bool Available, bool OwnRequestsLinked, int Unread, NotificationEntry[] Items) { public MediaBarSettings? MediaBarDefaults { get; init; } }
public sealed class NotificationAction
{
    public Guid[] Ids { get; set; } = [];
    public string Action { get; set; } = "shown";
}
public static class SeerrWebhook
{
    private static string Text(JsonElement element, string key)
    {
        if (element.ValueKind != JsonValueKind.Object) return string.Empty;
        foreach (var p in element.EnumerateObject()) if (string.Equals(p.Name, key, StringComparison.OrdinalIgnoreCase))
            return p.Value.ValueKind is JsonValueKind.String ? p.Value.GetString() ?? "" : p.Value.ValueKind is JsonValueKind.Number ? p.Value.ToString() : "";
        return string.Empty;
    }
    private static JsonElement Child(JsonElement element, string key) => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(key, out var child) ? child : default;
    public static PendingRequest? Parse(JsonElement body)
    {
        var type = Text(body, "notification_type");
        if (type == "TEST_NOTIFICATION") return null;
        if (type != "MEDIA_AVAILABLE") throw new ArgumentException("Only MEDIA_AVAILABLE and TEST_NOTIFICATION are accepted.");
        var media = Child(body, "media"); var request = Child(body, "request"); var requester = Child(request, "requestedBy");
        string Field(string direct, string nested) => Text(body, direct) is { Length: > 0 } v ? v : Text(media, nested);
        var item = Field("jellyfinMediaId", "jellyfinMediaId");
        var owner = Text(body, "requestedBy_jellyfinUserId"); if (owner.Length == 0) owner = Text(requester, "jellyfinUserId");
        var result = new PendingRequest {
            ItemId = Guid.TryParse(item, out var itemId) && itemId != Guid.Empty ? itemId : null,
            RequestedBy = Guid.TryParse(owner, out var userId) && userId != Guid.Empty ? userId : null,
            TmdbId = Field("tmdbId", "tmdbId"), TvdbId = Field("tvdbId", "tvdbId"), MediaType = Field("mediaType", "mediaType"),
            RequesterId = Text(body, "requestedBy_id"), RequestId = Text(body, "request_id"), Seasons = Text(body, "seasons")
        };
        var extra = Child(body, "extra");
        if (result.Seasons.Length == 0 && extra.ValueKind == JsonValueKind.Array)
            result.Seasons = string.Join(',', extra.EnumerateArray().Where(x => Text(x, "name").Contains("season", StringComparison.OrdinalIgnoreCase)).Select(x => Text(x, "value")));
        if (!long.TryParse(result.TmdbId, out var tmdb) || tmdb <= 0) result.TmdbId = "";
        if (!long.TryParse(result.TvdbId, out var tvdb) || tvdb <= 0) result.TvdbId = "";
        if (result.RequestId.Length == 0) result.RequestId = Text(request, "request_id");
        if (result.RequesterId.Length == 0) result.RequesterId = Text(requester, "id");
        if (result.RequesterId.Length == 0) result.RequesterId = Text(body, "requestedBy_username");
        if (result.MediaType is not ("movie" or "tv") ||
            (result.ItemId is null && !long.TryParse(result.TmdbId, out _) && !long.TryParse(result.TvdbId, out _)))
            throw new ArgumentException("Provide a mediaType and a Jellyfin, TMDB or TVDB identifier.");
        if (new[] { result.TmdbId, result.TvdbId, result.RequestId, result.RequesterId, result.Seasons }.Any(x => x.Length > 200)) throw new ArgumentException("Webhook field too long.");
        result.Key = string.Join(':', result.MediaType, result.ItemId?.ToString("N"), result.TmdbId, result.TvdbId, result.RequestId, owner, result.RequesterId, result.Seasons);
        return result;
    }
}
