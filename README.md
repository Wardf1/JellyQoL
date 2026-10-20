# Jelly QoL

![Jelly QoL](assets/jelly-qol.png)

Quality-of-life features for **Jellyfin 12.1**. Formerly Media Hider; existing title restrictions, user groups and reveal schedules are preserved when updating.

## Install or update

Requires **[File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)** for Jellyfin 12.1 (tested with 3.0.2.0). Its repository is:

```text
https://www.iamparadox.dev/jellyfin/plugins/manifest.json
```

Add the Jelly QoL repository in **Dashboard → Plugins → Repositories**:

```text
https://raw.githubusercontent.com/Wardf1/JellyfinMediaHider/main/manifest.json
```

Install or update, restart Jellyfin, then reload the web client. The existing Media Hider repository URL remains valid. Remove the old active-filter script from JS Injector to avoid duplicate warnings. File Transformation adds both scripts in memory; no web-directory write permissions are required.

## QoL tab

Enable or disable **active-filter warnings** and their animation for all accounts in the server's web client. The filter icon and warning text follow Jellyfin's native filter indicator live, including after resetting filters or navigating between libraries. Active filters and categories are highlighted, with category counts retained when Jellyfin unmounts collapsed controls. There is no separate persisted warning counter. Reduced-motion preferences disable animation automatically.

Filter selection is still managed by Jellyfin. In the Modern interface, use its native **Reset filters** button; the Legacy interface included in 12.1 also gets **Clear all filters**. Filter changes update warnings without reloading the interface. Saved QoL preferences reach other open clients within 30 seconds. The interface uses Polish for Polish locales and English otherwise.

## Media Hider tab

Administrators can search titles, hide or restore movies and entire series, and manage optional user groups. Visibility status appears beside a title's year/rating; the existing three-dot menu contains hide/restore actions. Season and episode actions apply to the parent series.

Without groups, hidden titles remain visible only to administrators. With groups, choose all non-administrator accounts or selected groups. Administrators always retain access. Membership in any targeted group blocks access; deleting the final targeted group makes the title administrator-only.

Each group has an optional, independent **one-time reveal date and time**, entered in the browser's time zone and stored in UTC. The **Jelly QoL → Reveal scheduled group titles** task checks every minute. At the deadline, only that group's restrictions are removed; other groups and administrator-only rules remain. The date is cleared after completion. Overdue dates are processed after startup. Leave the date empty to disable scheduling.

Server-side tags and Jellyfin parental controls enforce visibility in web, TV and mobile clients. Existing unrelated tags and restrictions are preserved. Open lists may need refreshing; existing playback and downloaded copies are unaffected. Restore hidden titles before uninstalling.

Requires .NET 10. Custom web controls require the server-hosted web client; native and separately hosted clients do not receive injected scripts. The assembly name, configuration file, plugin ID and internal API paths retain their original Media Hider identifiers for update compatibility. Licensed under GPL-3.0-only. The simple catalog thumbnail was edited with built-in imagegen; see [its prompt](assets/jelly-qol-prompt.txt).