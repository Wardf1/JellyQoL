namespace Jellyfin.Plugin.MediaHider;
public sealed record QoLSettings
{
    public bool EnableFilterWarnings { get; set; } = true;
    public bool AnimateFilterWarnings { get; set; } = true;
    public bool EnableHeaderLinks { get; set; } = true;
    public string HeaderLink1Name { get; set; } = "Changelog";
    public string HeaderLink1Url { get; set; } = string.Empty;
    public string HeaderLink2Name { get; set; } = "Jellyseerr";
    public string HeaderLink2Url { get; set; } = string.Empty;
    public bool EnableContextMenu { get; set; } = true;
    public bool EnableSearchOrder { get; set; } = true;
    public bool EnableToastIcons { get; set; } = true;
    public bool EnablePagination { get; set; } = true;
    public bool EnableAnnouncement { get; set; }
    public string AnnouncementTitle { get; set; } = string.Empty;
    public string AnnouncementMessage { get; set; } = string.Empty;
    public string AnnouncementDetails { get; set; } = string.Empty;
    public string AnnouncementUrl { get; set; } = string.Empty;
    public string AnnouncementLinkText { get; set; } = string.Empty;
    public string AnnouncementPosition { get; set; } = "top";
    public DateTime? AnnouncementShowAfter { get; set; }
    public DateTime? AnnouncementExpiresAt { get; set; }
    public int AnnouncementDurationSeconds { get; set; }
    public int AnnouncementMaxAppearances { get; set; } = 5;
    public int AnnouncementCooldownSeconds { get; set; } = 3600;
    public int AnnouncementResetHours { get; set; } = 24;
    public bool AnnouncementRepeatInSession { get; set; }
    public bool AnnouncementRememberDismiss { get; set; } = true;
    public QoLSettings Validated()
    {
        static string Text(string? value, int limit)
        {
            var result = value?.Trim() ?? string.Empty;
            if (result.Length > limit) throw new ArgumentException($"Text may contain at most {limit} characters.");
            return result;
        }
        static string Url(string? value)
        {
            var result = Text(value, 2048);
            if (result.Length == 0) return result;
            if (!Uri.TryCreate(result, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https") || !string.IsNullOrEmpty(uri.UserInfo))
                throw new ArgumentException("Use an absolute HTTP or HTTPS address without embedded credentials.");
            return result;
        }
        var result = this with {
            HeaderLink1Name = Text(HeaderLink1Name, 80), HeaderLink2Name = Text(HeaderLink2Name, 80),
            HeaderLink1Url = Url(HeaderLink1Url), HeaderLink2Url = Url(HeaderLink2Url),
            AnnouncementTitle = Text(AnnouncementTitle, 160), AnnouncementMessage = Text(AnnouncementMessage, 4000),
            AnnouncementDetails = Text(AnnouncementDetails, 4000), AnnouncementUrl = Url(AnnouncementUrl),
            AnnouncementLinkText = Text(AnnouncementLinkText, 120),
            AnnouncementShowAfter = AnnouncementShowAfter?.ToUniversalTime(), AnnouncementExpiresAt = AnnouncementExpiresAt?.ToUniversalTime()
        };
        if (result.AnnouncementPosition is not ("top" or "bottom")) throw new ArgumentException("Choose top or bottom.");
        if (result.AnnouncementDurationSeconds is < 0 or > 86400 || result.AnnouncementMaxAppearances is < 0 or > 100000 ||
            result.AnnouncementCooldownSeconds is < 0 or > 31536000 || result.AnnouncementResetHours is < 0 or > 87600)
            throw new ArgumentException("Announcement limits must be within the allowed range.");
        if (result.AnnouncementShowAfter.HasValue && result.AnnouncementExpiresAt <= result.AnnouncementShowAfter)
            throw new ArgumentException("The end must be after the start.");
        if (result.EnableAnnouncement && string.IsNullOrWhiteSpace(result.AnnouncementMessage)) throw new ArgumentException("Enter an announcement message.");
        if (result.HeaderLink1Url.Length > 0 && result.HeaderLink1Name.Length == 0 || result.HeaderLink2Url.Length > 0 && result.HeaderLink2Name.Length == 0)
            throw new ArgumentException("Enter a name for each configured shortcut.");
        return result;
    }
}
public sealed record FilterFeatures(bool EnableFilterWarnings, bool AnimateFilterWarnings);