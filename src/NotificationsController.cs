using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Jellyfin.Plugin.MediaHider;
[ApiController]
[Route("MediaHider/Notifications")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class NotificationsController(NotificationService service) : ControllerBase
{
    private Guid AccountId => Guid.TryParse(User.FindFirstValue("Jellyfin-UserId"), out var id) && id != Guid.Empty ? id : throw new UnauthorizedAccessException();
    [HttpGet]
    public ActionResult<NotificationFeed> Feed([FromQuery] bool popup = false, [FromQuery] int offset = 0) => Ok(service.Feed(AccountId, popup, offset));
    [HttpGet("MediaBar")]
    public ActionResult<MediaBarFeed> MediaBar() => Ok(service.MediaBar(AccountId));
    [HttpPost("Preferences")]
    public ActionResult Preferences([FromBody] NotificationPreferences value) { try { service.Preferences(AccountId, value); return NoContent(); } catch (ArgumentException ex) { return BadRequest(ex.Message); } }
    [HttpPost("History/Clear")]
    public ActionResult ClearHistory() { service.ClearHistory(AccountId); return NoContent(); }
    [HttpPost("Actions")]
    public ActionResult Actions([FromBody] NotificationAction value) { try { return Ok(service.Act(AccountId, value)); } catch (ArgumentException ex) { return BadRequest(ex.Message); } }
    [HttpGet("Admin")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult Admin() => Ok(new { Options = service.Options(), Diagnostics = service.Diagnostics() });
    [HttpPost("Admin")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult Save([FromBody] NotificationOptions value) { try { service.Configure(value); return NoContent(); } catch (ArgumentException ex) { return BadRequest(ex.Message); } }
    [HttpPost("Secret")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult Secret() => Ok(new { Secret = service.RotateSecret() });
    [HttpPost("Test")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult Test() => Ok(new { Test = true, Name = "Jelly QoL", Type = "Movie", Count = 1 });
    [AllowAnonymous]
    [HttpPost("Webhook")]
    [RequestSizeLimit(32768)]
    public ActionResult Webhook([FromBody] JsonElement value)
    {
        var secret = Request.Headers["X-JellyQoL-Secret"].ToString();
        if (string.IsNullOrEmpty(secret)) { var auth = Request.Headers.Authorization.ToString(); if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) secret = auth[7..]; }
        if (!service.AcceptSecret(secret)) return Unauthorized();
        try { service.Receive(value); return Accepted(); } catch (ArgumentException ex) { service.WebhookError(); return BadRequest(ex.Message); }
    }
}
