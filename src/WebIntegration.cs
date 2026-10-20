using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace Jellyfin.Plugin.MediaHider;
public sealed class TransformationInput
{
    public string Contents { get; set; } = string.Empty;
}
public sealed class WebIntegration(ILogger<WebIntegration> logger) : IHostedService
{
    private const string Begin = "<!-- MediaHider:begin -->";
    private const string End = "<!-- MediaHider:end -->";
    public const string TransformationId = "debb2788-c58a-4807-93ed-e4c49318248a";
    public string? LastError { get; private set; }
    public bool Registered { get; private set; }
    public static string Remove(string html)
    {
        var start = html.IndexOf(Begin, StringComparison.Ordinal);
        while (start >= 0)
        {
            var end = html.IndexOf(End, start, StringComparison.Ordinal);
            if (end < 0) throw new InvalidDataException("Incomplete Jelly QoL script marker in index.html.");
            html = html.Remove(start, end + End.Length - start);
            start = html.IndexOf(Begin, StringComparison.Ordinal);
        }
        return html;
    }
    public static string Inject(string html)
    {
        var clean = Remove(html);
        var index = clean.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (index < 0) throw new InvalidDataException("Jellyfin index.html has no closing body tag.");
        return clean.Insert(index, Begin + "<script defer src=\"../MediaHider/Client.js?v=1.5.1.0\"></script><script defer src=\"../MediaHider/FilterWarnings.js?v=1.5.1.0\"></script><script defer src=\"../MediaHider/WebExtras.js?v=1.5.1.0\"></script>" + End);
    }
    // File Transformation deserializes its JSON payload into this public callback's parameter type.
    public static string TransformIndexHtml(TransformationInput input) => Inject(input.Contents);

    public static void Register(Assembly integrationAssembly)
    {
        // Plugins use separate load contexts. Parse the registration JSON with the dependency's
        // own payload type rather than shipping or directly referencing its Newtonsoft assembly.
        var type = integrationAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface")
            ?? throw new MissingMemberException("File Transformation registration API was not found.");
        var register = type.GetMethod("RegisterTransformation", BindingFlags.Public | BindingFlags.Static)
            ?? throw new MissingMethodException("File Transformation registration method was not found.");
        var parameters = register.GetParameters();
        if (parameters.Length != 1) throw new MissingMethodException("Unsupported File Transformation registration signature.");
        var parse = parameters[0].ParameterType.GetMethod("Parse", BindingFlags.Public | BindingFlags.Static, [typeof(string)])
            ?? throw new MissingMethodException("File Transformation JSON parser was not found.");
        var json = JsonSerializer.Serialize(new
        {
            id = TransformationId,
            // Use the shared key recommended by File Transformation so other plugins' index
            // transformations run in the same pipeline and retain their own script loaders.
            fileNamePattern = "index.html",
            callbackAssembly = typeof(WebIntegration).Assembly.FullName,
            callbackClass = typeof(WebIntegration).FullName,
            callbackMethod = nameof(TransformIndexHtml)
        });
        var payload = parse.Invoke(null, [json]) ?? throw new InvalidOperationException("Empty File Transformation registration payload.");
        register.Invoke(null, [payload]);
    }
    public Task StartAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        Registered = false;
        var integration = AssemblyLoadContext.All.SelectMany(context => context.Assemblies)
            .FirstOrDefault(assembly => assembly.GetName().Name == "Jellyfin.Plugin.FileTransformation");
        if (integration is null)
        {
            LastError = "Install or enable File Transformation for Jellyfin 12.1, then restart Jellyfin. Jelly QoL does not modify web files.";
            logger.LogWarning("Jelly QoL: {Message}", LastError);
            return Task.CompletedTask;
        }
        try
        {
            Register(integration);
            Registered = true;
            LastError = null;
            logger.LogInformation("Jelly QoL: registered the in-memory index.html transformation with File Transformation.");
        }
        catch (Exception ex)
        {
            LastError = "Could not register with File Transformation. Install a compatible version for Jellyfin 12.1, restart Jellyfin, and check the server log.";
            logger.LogWarning(ex, "Jelly QoL: {Message}", LastError);
        }
        return Task.CompletedTask;
    }
    // Registrations live only in the dependency's process-local pipeline and disappear at shutdown.
    // Neither startup, request transformation nor shutdown writes to the Jellyfin web directory.
    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
