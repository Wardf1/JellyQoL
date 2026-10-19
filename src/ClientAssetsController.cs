using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Jellyfin.Plugin.MediaHider;
[ApiController]
[Route("MediaHider")]
public sealed class ClientAssetsController : ControllerBase
{
    // Only the static UI script is public. All visibility data and mutations require an administrator.
    [AllowAnonymous]
    [HttpGet("Client.js")]
    public ActionResult Script()
    {
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.MediaHider.src.Client.js");
        return stream is null ? NotFound() : File(stream, "application/javascript; charset=utf-8");
    }
}
