using System.Globalization;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.MediaHider;

public sealed partial class NotificationService
{
    private static readonly Dictionary<string, string> Languages = CultureInfo.GetCultures(CultureTypes.NeutralCultures)
        .Where(c => c.TwoLetterISOLanguageName.Length == 2)
        .GroupBy(c => c.ThreeLetterISOLanguageName, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(g => g.Key, g => g.First().TwoLetterISOLanguageName, StringComparer.OrdinalIgnoreCase);

    private static string Language(string? value)
    {
        var code = (value ?? "").Trim().Replace('_', '-').Split('-')[0].ToLowerInvariant();
        code = code switch { "fre" => "fra", "ger" => "deu", "chi" => "zho", "dut" => "nld", "cze" => "ces", "gre" => "ell", "rum" => "ron", _ => code };
        return Languages.TryGetValue(code, out var language) ? language : code.Length == 2 && Languages.ContainsValue(code) ? code : "";
    }

    private MediaSnapshot CaptureMedia(BaseItem item)
    {
        var streams = (_mediaSources.GetMediaStreams(item.Id) ?? []).ToArray();
        var quality = streams.Where(s => s.Type == MediaStreamType.Video && !s.IsExternal).Select(s => {
            var width = s.Width ?? 0; var height = s.Height ?? 0;
            return width >= 7600 || height >= 4320 ? 6 : width >= 3800 || height >= 2160 ? 5 : width >= 2500 || height >= 1440 ? 4 : width >= 1900 || height >= 1080 ? 3 : width >= 1200 || height >= 720 ? 2 : width > 0 || height > 0 ? 1 : 0;
        }).DefaultIfEmpty().Max();
        string[] Codes(MediaStreamType type) => streams.Where(s => s.Type == type).Select(s => Language(s.Language)).Where(s => s.Length > 0).Distinct().Order().ToArray();
        return new() { ItemId = item.Id, LogicalKey = MediaKeys(item).FirstOrDefault(key => key.StartsWith("movie:", StringComparison.Ordinal) || key.StartsWith("episode:", StringComparison.Ordinal)), HasStreams = streams.Any(s => s.Type == MediaStreamType.Video), Quality = quality,
            AudioLanguages = Codes(MediaStreamType.Audio), SubtitleLanguages = Codes(MediaStreamType.Subtitle) };
    }

    private static IEnumerable<string> MediaKeys(BaseItem item)
    {
        static string PathKey(string path) => OperatingSystem.IsWindows() ? path.Replace('\\', '/').ToLowerInvariant() : path.Replace('\\', '/');
        static string Provider(BaseItem title) => new[] { "Tmdb", "Tvdb", "Imdb" }
            .Where(key => title.ProviderIds.TryGetValue(key, out var id) && !string.IsNullOrWhiteSpace(id))
            .Select(key => key.ToLowerInvariant() + ":" + title.ProviderIds[key].Trim().ToLowerInvariant()).FirstOrDefault() ?? "id:" + title.Id.ToString("N");
        yield return "id:" + item.Id.ToString("N");
        if (!string.IsNullOrWhiteSpace(item.Path)) yield return "path:" + PathKey(item.Path);
        if (item is Episode episode && episode.IndexNumber.HasValue && episode.ParentIndexNumber.HasValue &&
            episode.GetParents().OfType<Series>().FirstOrDefault() is { } series)
            yield return $"episode:{Provider(series)}:{PathKey(series.Path ?? "")}:{episode.ParentIndexNumber}:{episode.IndexNumber}";
        if (item is Movie && new[] { "Tmdb", "Tvdb", "Imdb" }.Any(item.ProviderIds.ContainsKey)) {
            var path = PathKey(item.Path); var slash = path.LastIndexOf('/');
            yield return "movie:" + Provider(item) + ":" + (slash >= 0 ? path[..slash] : "");
        }
    }

    private Guid? SnapshotId(IEnumerable<string> keys)
    {
        var aliases = keys.ToArray();
        var logical = aliases.FirstOrDefault(key => key.StartsWith("movie:", StringComparison.Ordinal) || key.StartsWith("episode:", StringComparison.Ordinal));
        foreach (var key in aliases) if (_data.MediaAliases.TryGetValue(key, out var id) && _data.MediaSnapshots.TryGetValue(id, out var snapshot)) {
            if (key.StartsWith("path:", StringComparison.Ordinal) && logical is not null && snapshot.LogicalKey is not null && logical != snapshot.LogicalKey) continue;
            return id;
        }
        return null;
    }

    private void SeedMediaBaseline(bool reset = false)
    {
        if (_data.MediaBaselineInitialized && !reset) return;
        foreach (var item in _library.GetItemList(new() { Recursive = true, IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Episode], IsVirtualItem = false }).Where(Playable)) {
            var keys = MediaKeys(item).ToArray(); var known = SnapshotId(keys); if (known.HasValue && !reset) continue;
            var snapshot = CaptureMedia(item);
            var existing = _data.Records.Where(r => r.ItemId == item.Id).MaxBy(r => r.Created);
            snapshot.LastRecordId = existing?.Id;
            var id = known ?? item.Id;
            _data.MediaSnapshots[id] = snapshot;
            foreach (var key in keys) _data.MediaAliases[key] = id;
            if (existing is not null) existing.MediaSnapshotId = id;
        }
        _data.MediaBaselineInitialized = true;
    }

    public void InitializeMediaBaseline() => Locked(() => { SeedMediaBaseline(); Save(); return true; });

    private NotificationRecord? ObserveMedia(BaseItem item)
    {
        var keys = MediaKeys(item).ToArray(); var knownId = SnapshotId(keys); var id = knownId ?? item.Id;
        var before = knownId.HasValue ? _data.MediaSnapshots[id] : null;
        var after = CaptureMedia(item); after.LastRecordId = before?.LastRecordId;
        var priorRecord = _data.Records.FirstOrDefault(r => r.Id == after.LastRecordId);
        if (before is not null && before.ItemId != item.Id) {
            foreach (var record in _data.Records.Where(r => r.MediaSnapshotId == id || r.ItemId == before.ItemId)) record.ItemId = item.Id;
        }
        _data.MediaSnapshots[id] = after;
        foreach (var key in keys) _data.MediaAliases[key] = id;
        NotificationChanges? changes = null;
        if (before is not null) {
            if (before.HasStreams && after.HasStreams) {
                changes = new() { AudioLanguages = after.AudioLanguages.Except(before.AudioLanguages).ToArray(),
                    SubtitleLanguages = after.SubtitleLanguages.Except(before.SubtitleLanguages).ToArray(),
                    Quality = before.Quality > 0 && after.Quality > before.Quality ? new[] { "", "SD", "HD", "Full HD", "1440p", "4K", "8K" }[after.Quality] : null };
            }
            if (changes is null || changes.AudioLanguages.Length == 0 && changes.SubtitleLanguages.Length == 0 && changes.Quality is null)
                return priorRecord?.Created >= DateTime.UtcNow.AddMinutes(-10) ? priorRecord : null;
        }
        var series = item is Episode ? item.GetParents().OfType<Series>().FirstOrDefault() : null;
        if (changes is null && series is not null && _data.KnownSeries.Add(series.Id)) _data.NewSeriesUntil[series.Id] = DateTime.UtcNow.AddMinutes(10);
        var next = new NotificationRecord { ItemId = item.Id, MediaSnapshotId = id, Changes = changes,
            NewSeries = changes is null && series is not null && _data.NewSeriesUntil.TryGetValue(series.Id, out var until) && until > DateTime.UtcNow };
        _data.Records.Add(next); after.LastRecordId = next.Id; return next;
    }
}
