using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
namespace Jellyfin.Plugin.MediaHider;
public sealed class ServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost host)
    {
        services.AddSingleton<NotificationService>();
        services.AddHostedService(provider => provider.GetRequiredService<NotificationService>());
        services.AddSingleton<WebIntegration>();
        services.AddHostedService(provider => provider.GetRequiredService<WebIntegration>());
        services.AddSingleton<VisibilityService>();
        services.AddHostedService(provider => provider.GetRequiredService<VisibilityService>());
    }
}
