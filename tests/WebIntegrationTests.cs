using Jellyfin.Plugin.MediaHider;
using Xunit;
namespace MediaHider.Tests;
public sealed class WebIntegrationTests
{
    [Fact]
    public void InjectionIsIdempotentAndPreservesOtherPluginScripts()
    {
        const string original = "<html><body><script src=\"enhanced.js\"></script></body></html>";
        var once = WebIntegration.Inject(original);
        Assert.Equal(once, WebIntegration.Inject(once));
        Assert.Contains("enhanced.js", once);
        Assert.Contains("../MediaHider/Client.js?v=1.3.0.0", once);
        Assert.Equal(original, WebIntegration.Remove(once));
    }
    [Fact]
    public void InjectionReplacesOldVersionAndRejectsMalformedDocuments()
    {
        var old = WebIntegration.Inject("<BODY>Other content</BODY>").Replace("?v=1.3.0.0", "?v=1.0.0.0");
        Assert.DoesNotContain("?v=1.0.0.0", WebIntegration.Inject(old));
        Assert.Throws<InvalidDataException>(() => WebIntegration.Inject("<html>"));
        Assert.Throws<InvalidDataException>(() => WebIntegration.Inject("<body><!-- MediaHider:begin --></body>"));
    }
    [Fact]
    public void PublicAssetContainsOnlyUiCodeAndIsEmbedded()
    {
        using var stream = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.MediaHider.src.Client.js");
        Assert.NotNull(stream);
        using var reader = new StreamReader(stream!);
        Assert.Contains("data-mediahider-status", reader.ReadToEnd());
    }
    [Fact]
    public void ReflectionRegistrationUsesStableIdSharedPipelineAndOurCallback()
    {
        WebIntegration.Register(typeof(Jellyfin.Plugin.FileTransformation.PluginInterface).Assembly);
        var json = Jellyfin.Plugin.FileTransformation.PluginInterface.Payload!.Data;
        Assert.Equal(WebIntegration.TransformationId, json.GetProperty("id").GetString());
        Assert.Equal("index.html", json.GetProperty("fileNamePattern").GetString());
        Assert.Equal(typeof(WebIntegration).Assembly.FullName, json.GetProperty("callbackAssembly").GetString());
        Assert.Equal(typeof(WebIntegration).FullName, json.GetProperty("callbackClass").GetString());
        Assert.Equal(nameof(WebIntegration.TransformIndexHtml), json.GetProperty("callbackMethod").GetString());
        var transformed = WebIntegration.TransformIndexHtml(new TransformationInput { Contents = "<body><script src=\"enhanced.js\"></script></body>" });
        Assert.Contains("enhanced.js", transformed);
        Assert.Contains("MediaHider/Client.js?v=1.3.0.0", transformed);
    }
    [Fact]
    public void UnsupportedDependencyApiFailsExplicitly()
    {
        Assert.Throws<MissingMemberException>(() => WebIntegration.Register(typeof(WebIntegration).Assembly));
    }
    [Fact]
    public async Task MissingDependencyReportsInstallationWithoutRequiringAWebDirectory()
    {
        var service = new WebIntegration(Microsoft.Extensions.Logging.Abstractions.NullLogger<WebIntegration>.Instance);
        await service.StartAsync(default);
        Assert.False(service.Registered);
        Assert.Contains("File Transformation", service.LastError);
        Assert.DoesNotContain("write access", service.LastError);
        await service.StopAsync(default);
    }
    [Fact]
    public void GroupConfigurationRoundTripsUtcSchedulesAndMembershipThroughXml()
    {
        var id = Guid.NewGuid(); var user = Guid.NewGuid(); var item = Guid.NewGuid(); var date = DateTime.UtcNow.AddDays(2);
        var config = new PluginConfiguration { Groups = [new UserGroup { Id = id, Name = "Group A", UserIds = [user], RevealAtUtc = date }],
            GroupRules = [new GroupVisibilityRule { ItemId = item, GroupIds = [id] }] };
        var serializer = new System.Xml.Serialization.XmlSerializer(typeof(PluginConfiguration));
        using var stream = new MemoryStream(); serializer.Serialize(stream, config); stream.Position = 0;
        var copy = (PluginConfiguration)serializer.Deserialize(stream)!;
        Assert.Equal(date, copy.Groups[0].RevealAtUtc); Assert.Equal(DateTimeKind.Utc, copy.Groups[0].RevealAtUtc!.Value.Kind);
        Assert.Equal(user, copy.Groups[0].UserIds[0]); Assert.Equal(item, copy.GroupRules[0].ItemId);
    }
    [Fact]
    public void SchedulerUsesAnIndependentMinuteInterval()
    {
        var task = new RevealScheduledTask(null!);
        Assert.Equal("Media Hider", task.Category);
        Assert.Equal(TimeSpan.FromMinutes(1).Ticks, Assert.Single(task.GetDefaultTriggers()).IntervalTicks);
    }
}
