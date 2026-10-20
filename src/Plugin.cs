using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
namespace Jellyfin.Plugin.MediaHider;
public sealed class UserGroup
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid[] UserIds { get; set; } = [];
    public DateTime? RevealAtUtc { get; set; }
    public DateTime? LastRevealAtUtc { get; set; }
}
public sealed class GroupVisibilityRule
{
    public Guid ItemId { get; set; }
    public Guid[] GroupIds { get; set; } = [];
}
public sealed class PluginConfiguration : BasePluginConfiguration
{
    public QoLSettings QoL { get; set; } = new();
    public Guid[] HiddenItemIds { get; set; } = [];
    public UserGroup[] Groups { get; set; } = [];
    public GroupVisibilityRule[] GroupRules { get; set; } = [];
}
public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public static Plugin Instance { get; private set; } = null!;
    public Plugin(IApplicationPaths paths, IXmlSerializer serializer) : base(paths, serializer) => Instance = this;
    public override string Name => "Jelly QoL";
    public override string Description => "Quality-of-life features for Jellyfin 12.1: filter warnings, service shortcuts, announcements, pagination, search and media visibility.";
    public override Guid Id => new("6801f019-837b-4c81-a542-572e55d871ba");
    public IEnumerable<PluginPageInfo> GetPages() => [new() { Name = "mediahider", DisplayName = "Jelly QoL", EnableInMainMenu = true, MenuIcon = "tune", EmbeddedResourcePath = GetType().Namespace + ".src.configPage.html" }];
}
