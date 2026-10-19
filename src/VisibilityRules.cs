namespace Jellyfin.Plugin.MediaHider;
public static class VisibilityRules
{
    public const string HiddenTag = "mediahider:6801f019-837b-4c81-a542-572e55d871ba";
    public const string ManagedItemTag = HiddenTag + ":managed";
    private const string GroupPrefix = HiddenTag + ":group:";
    public static string GroupTag(Guid id) => GroupPrefix + id.ToString("N");
    private static bool GroupOwned(string tag) => tag.StartsWith(GroupPrefix, StringComparison.OrdinalIgnoreCase);
    public static string[] TagsFor(IEnumerable<string> tags, bool hidden) => hidden
        ? tags.Contains(HiddenTag, StringComparer.OrdinalIgnoreCase) ? tags.ToArray() : tags.Append(HiddenTag).ToArray()
        : tags.Where(t => !string.Equals(t, HiddenTag, StringComparison.OrdinalIgnoreCase)).ToArray();
    public static string[] BlockedTagsFor(IEnumerable<string> tags, bool administrator, IEnumerable<Guid>? groupIds = null)
    {
        var result = TagsFor(tags.Where(t => !GroupOwned(t)), !administrator).ToList();
        if (!administrator && groupIds is not null)
            result.AddRange(groupIds.Distinct().Select(GroupTag));
        return result.ToArray();
    }
    public static string[] ItemTagsFor(IEnumerable<string> tags, IEnumerable<string> required)
    {
        var result = tags.Where(t => !GroupOwned(t) && !string.Equals(t, HiddenTag, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(t, ManagedItemTag, StringComparison.OrdinalIgnoreCase)).ToList();
        var managed = required.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (managed.Length > 0) result.Add(ManagedItemTag);
        result.AddRange(managed);
        return result.ToArray();
    }
}
