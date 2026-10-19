using MediaBrowser.Model.Tasks;
namespace Jellyfin.Plugin.MediaHider;
public sealed class RevealScheduledTask(VisibilityService service) : IScheduledTask
{
    public string Name => "Reveal scheduled group titles";
    public string Key => "MediaHiderScheduledGroupReveals";
    public string Description => "Reveal titles for each group whose optional one-time date and time have arrived.";
    public string Category => "Media Hider";
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => [new() { Type = TaskTriggerInfoType.IntervalTrigger, IntervalTicks = TimeSpan.FromMinutes(1).Ticks }];
    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        progress.Report(0);
        await service.RunScheduledRevealsAsync(DateTime.UtcNow, cancellationToken).ConfigureAwait(false);
        progress.Report(100);
    }
}
