using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Model.Entities;
namespace Jellyfin.Plugin.MediaHider;
public sealed record MediaBarSettings
{
    public bool Enabled { get; set; } = true;
    public string Source { get; set; } = "random";
    public int ItemCount { get; set; } = 8;
    public int IntervalSeconds { get; set; } = 10;
    public bool AutoRotate { get; set; } = true;
    public bool ShowOverview { get; set; } = true;
    public bool Compact { get; set; }
    public string Layout { get; set; } = "banner";
    public string BackdropPosition { get; set; } = "top";
    public int Height { get; set; } = 78;
    public bool ShowLogo { get; set; } = true;
    public bool ShowRating { get; set; } = true;
    public bool ShowGenres { get; set; } = true;
    public bool ShowButtons { get; set; } = true;
    public bool ShowDots { get; set; } = true;
    public int OverviewLines { get; set; } = 3;
    public int MinSwipeDistance { get; set; } = 50;
    public int PreloadCount { get; set; } = 2;
    public bool PauseDuringTrailer { get; set; } = true;
    public bool EnableTrailers { get; set; } = true;
    public string TrailerSource { get; set; } = "auto";
    public int TrailerDelay { get; set; } = 2;
    public MediaBarSettings Validated()
    {
        if (TrailerSource is not ("auto" or "local" or "youtube") || TrailerDelay is < 0 or > 15 || Layout is not ("banner" or "card") || BackdropPosition is not ("top" or "center" or "bottom") || Height is < 50 or > 100 || OverviewLines is < 1 or > 8 || MinSwipeDistance is < 20 or > 200 || PreloadCount is < 0 or > 5 || Source is not ("random" or "recent") || ItemCount is < 1 or > 20 || IntervalSeconds is < 5 or > 60)
            throw new ArgumentException("Invalid Media Bar settings.");
        return this;
    }
}
public sealed record MediaBarItem(Guid Id, string Name, string Type, int? Year, float? CommunityRating, string? OfficialRating, string Overview, string[] Genres, bool HasLogo, MediaBarTrailer? Trailer, string? LogoImageTag = null, string? BackdropImageTag = null, int? SeasonCount = null);
public sealed record MediaBarTrailer(string Kind, Guid? ItemId = null, string? YouTubeId = null);
public sealed record MediaBarFeed(MediaBarSettings Settings, bool TrailersEnabled, MediaBarItem[] Items, string TrailerSource = "auto", bool TrailerAutoplay = true, int TrailerDelay = 2, bool TrailerSound = false);
public sealed partial class NotificationService
{
    private readonly Dictionary<Guid, (DateTime Expires, int Count, Guid[] Ids)> _featuredCache = [];
    public MediaBarFeed MediaBar(Guid userId) => Locked(() => {
        var account = Account(userId);
        var settings = (Plugin.Instance.Configuration.QoL.MediaBar ?? new()).Validated() with { };
        settings.PauseDuringTrailer = true;
        if (!settings.Enabled) return new MediaBarFeed(settings, settings.EnableTrailers && account.Preferences.MediaBarTrailers, []);
        var user = _users.GetUserById(userId)!;
        var query = new InternalItemsQuery(user) { Recursive = true, IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series],
            IsVirtualItem = false, ImageTypes = [ImageType.Backdrop], Limit = 200,
            OrderBy = [(settings.Source == "recent" ? ItemSortBy.DateCreated : ItemSortBy.Random, SortOrder.Descending)] };
        var valid = new Func<BaseItem, bool>(item => item is Movie or Series && !item.IsVirtualItem && item.HasImage(ImageType.Backdrop) && Visible(item, user));
        var now = DateTime.UtcNow;
        var reuseSelection = _featuredCache.TryGetValue(userId, out var cached) && cached.Expires > now && cached.Count == settings.ItemCount && settings.Source == "random";
        var candidates = reuseSelection
            ? cached.Ids.Select(id => _library.GetItemById(id)).OfType<BaseItem>().Where(valid).ToList() : [];
        if (settings.Source != "random" || candidates.Count < settings.ItemCount) candidates.AddRange(_library.GetItemList(query).Where(valid));
        if (settings.Source == "random" && !reuseSelection && cached.Ids is not null) {
            var previous = cached.Ids.ToHashSet();
            candidates = candidates.OrderBy(item => previous.Contains(item.Id)).ToList();
        }
        candidates = candidates.DistinctBy(item => item.Id).Take(settings.ItemCount).ToList();
        if (settings.Source == "random") {
            _featuredCache[userId] = (reuseSelection ? cached.Expires : now.AddMinutes(10), settings.ItemCount, candidates.Select(item => item.Id).ToArray());
            foreach (var expired in _featuredCache.Where(pair => pair.Value.Expires < now).Select(pair => pair.Key).ToArray()) _featuredCache.Remove(expired);
        }
        var seriesIds = candidates.OfType<Series>().Select(series => series.Id).ToHashSet();
        var seasons = new Dictionary<Guid, int>();
        if (seriesIds.Count > 0) {
            seasons = _library.GetItemList(new InternalItemsQuery(user) { Recursive = true, AncestorIds = seriesIds.ToArray(),
                    IncludeItemTypes = [BaseItemKind.Episode], IsVirtualItem = false, IsMissing = false, ParentIndexNumberNotEquals = 0 })
                .OfType<Episode>().Where(episode => episode.ParentIndexNumber > 0 && Playable(episode))
                .GroupBy(episode => episode.SeriesId != Guid.Empty ? episode.SeriesId : episode.GetParents().OfType<Series>().FirstOrDefault()?.Id ?? Guid.Empty)
                .ToDictionary(group => group.Key, group => group.Select(episode => episode.ParentIndexNumber!.Value).Distinct().Count());
        }
        var items = candidates
            .DistinctBy(item => item.Id).Take(settings.ItemCount).Select(item => new MediaBarItem(item.Id, item.Name, item is Movie ? "Movie" : "Series", item.ProductionYear,
                item.CommunityRating, item.OfficialRating, (item.Overview ?? string.Empty)[..Math.Min(item.Overview?.Length ?? 0, 600)], item.Genres.Take(3).ToArray(), item.HasImage(ImageType.Logo), settings.EnableTrailers && account.Preferences.MediaBarTrailers ? Trailer(item, userId, settings.TrailerSource) : null, ImageTag(item, ImageType.Logo), ImageTag(item, ImageType.Backdrop), item is Series ? seasons.GetValueOrDefault(item.Id) : null)).ToArray();
        return new MediaBarFeed(settings, settings.EnableTrailers && account.Preferences.MediaBarTrailers, items, settings.TrailerSource, true, settings.TrailerDelay, account.Preferences.MediaBarTrailerSound);
    });
    private string? ImageTag(BaseItem item, ImageType type)
    {
        var image = item.GetImageInfo(type, 0);
        if (image is null) return null;
        try { return _imageProcessor.GetImageCacheTag(item, image); }
        catch (IOException) { return null; }
    }
    private MediaBarTrailer? Trailer(BaseItem item, Guid userId, string source)
    {
        if (source != "youtube" && item is IHasTrailers local)
            foreach (var candidate in local.LocalTrailers.Where(candidate => candidate.ExtraType == ExtraType.Trailer))
                if (_library.GetItemById<BaseItem>(candidate.Id, userId) is Video video && !video.IsVirtualItem && !string.IsNullOrEmpty(video.Path))
                    return new("local", video.Id);
        if (source == "local") return null;
        foreach (var trailer in item.RemoteTrailers ?? [])
            if (YouTubeId(trailer.Url) is { } id) return new("youtube", null, id);
        return null;
    }
    public static string? YouTubeId(string? address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.UserInfo.Length > 0) return null;
        var host = uri.IdnHost.ToLowerInvariant(); string? id = null;
        if (host == "youtu.be") id = uri.AbsolutePath.Trim('/').Split('/')[0];
        else if (host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "www.youtube-nocookie.com") {
            if (uri.AbsolutePath.StartsWith("/embed/", StringComparison.Ordinal) || uri.AbsolutePath.StartsWith("/shorts/", StringComparison.Ordinal)) id = uri.AbsolutePath.Split('/').ElementAtOrDefault(2);
            else id = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query).TryGetValue("v", out var value) ? value.ToString() : null;
        }
        return id is { Length: 11 } && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-') ? id : null;
    }}
