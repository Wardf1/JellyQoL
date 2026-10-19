using Jellyfin.Data.Events.Users;
using MediaBrowser.Controller.Events;
namespace Jellyfin.Plugin.MediaHider;
// Do not await reconciliation inside a user event: updating a policy emits another event.
public sealed class UserEvents(VisibilityService service) : IEventConsumer<UserCreatedEventArgs>, IEventConsumer<UserUpdatedEventArgs>
{
    public Task OnEvent(UserCreatedEventArgs args) { service.Signal(); return Task.CompletedTask; }
    public Task OnEvent(UserUpdatedEventArgs args) { service.Signal(); return Task.CompletedTask; }
}
