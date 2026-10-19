using System.Text.Json;
namespace Jellyfin.Plugin.FileTransformation;
// A test-only stand-in for the dependency's documented reflection contract.
// No dependency implementation or binary is shipped with Media Hider.
public sealed class RegistrationPayload
{
    public JsonElement Data { get; private set; }
    public static RegistrationPayload Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return new RegistrationPayload { Data = document.RootElement.Clone() };
    }
}
public static class PluginInterface
{
    public static RegistrationPayload? Payload { get; private set; }
    public static void RegisterTransformation(RegistrationPayload payload) => Payload = payload;
}
