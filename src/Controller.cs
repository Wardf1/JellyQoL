using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Jellyfin.Plugin.MediaHider;
[ApiController]
[Route("MediaHider")]
[Authorize(Policy = "RequiresElevation")]
public sealed class MediaHiderController(VisibilityService service, WebIntegration web) : ControllerBase
{
    [HttpGet("Search")]
    public async Task<ActionResult<IReadOnlyList<MediaEntry>>> Search([FromQuery] string query, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 2 || query.Length > 200)
            return BadRequest("Enter between 2 and 200 characters.");
        return Ok(await service.SearchAsync(query, ct).ConfigureAwait(false));
    }
    [HttpGet("Hidden")]
    public async Task<ActionResult<IReadOnlyList<MediaEntry>>> Hidden(CancellationToken ct) => Ok(await service.ListAsync(ct).ConfigureAwait(false));
    [HttpGet("Status")]
    public ActionResult Status() => Ok(new { LastError = service.LastError, WebIntegrationError = web.LastError, FileTransformationRegistered = web.Registered });
    [HttpGet("Items/{id:guid}/Visibility")]
    public async Task<ActionResult<MediaVisibility>> Visibility(Guid id, CancellationToken ct)
    {
        var state = await service.GetVisibilityAsync(id, ct).ConfigureAwait(false);
        return state is null ? NotFound() : Ok(state);
    }
    [HttpPost("Hidden/{id:guid}")]
    public async Task<ActionResult> Hide(Guid id, CancellationToken ct)
    {
        try { await service.SetHiddenAsync(id, true, ct).ConfigureAwait(false); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }
    [HttpDelete("Hidden/{id:guid}")]
    public async Task<ActionResult> Restore(Guid id, CancellationToken ct)
    { await service.SetHiddenAsync(id, false, ct).ConfigureAwait(false); return NoContent(); }
    [HttpPost("RestoreAll")]
    public async Task<ActionResult> RestoreAll(CancellationToken ct)
    { await service.RestoreAllAsync(ct).ConfigureAwait(false); return NoContent(); }
    [HttpPost("Reconcile")]
    public async Task<ActionResult> Reconcile(CancellationToken ct)
    { await service.ReconcileAsync(ct).ConfigureAwait(false); return NoContent(); }
    [HttpGet("Groups")]
    public async Task<ActionResult<GroupSettings>> Groups(CancellationToken ct) => Ok(await service.GetGroupsAsync(ct).ConfigureAwait(false));
    [HttpPost("Groups")]
    public async Task<ActionResult> SaveGroup([FromBody] GroupUpdateRequest request, CancellationToken ct)
    {
        try { return Ok(new { Id = await service.SaveGroupAsync(request.Id, request.Name, request.UserIds, request.RevealAtUtc?.UtcDateTime, ct).ConfigureAwait(false) }); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }
    [HttpDelete("Groups/{id:guid}")]
    public async Task<ActionResult> DeleteGroup(Guid id, CancellationToken ct)
    {
        try { await service.DeleteGroupAsync(id, ct).ConfigureAwait(false); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }
    [HttpPost("Hidden/{id:guid}/Groups")]
    public async Task<ActionResult> HideForGroups(Guid id, [FromBody] GroupAudienceRequest request, CancellationToken ct)
    {
        try { await service.SetGroupsHiddenAsync(id, request.GroupIds, ct).ConfigureAwait(false); return NoContent(); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }
}
public sealed class GroupUpdateRequest
{
    public Guid? Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid[] UserIds { get; set; } = [];
    public DateTimeOffset? RevealAtUtc { get; set; }
}
public sealed class GroupAudienceRequest
{
    public Guid[] GroupIds { get; set; } = [];
}
