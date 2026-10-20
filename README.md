# Jelly QoL

![Jelly QoL](assets/jelly-qol.png)

Quality-of-life features for **Jellyfin 12.1**, with Polish and English controls. Formerly Media Hider; title restrictions, groups and reveal schedules are preserved.

## Install or update

Requires **[File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)** for Jellyfin 12.1 (tested with 3.0.2.0). Add its repository if needed:

```text
https://www.iamparadox.dev/jellyfin/plugins/manifest.json
```

Add the Jelly QoL repository in **Dashboard → Plugins → Repositories**:

```text
https://raw.githubusercontent.com/Wardf1/JellyQoL/main/manifest.json
```

Install or update, restart Jellyfin, and reload the web client. If your Jellyfin installation still uses the previous repository address, replace it with the URL above. Plugin settings are preserved. For a server still running **Media Hider 1.3**, install **1.4** from the version selector and restart before upgrading further; 1.4 handles the name transition.

File Transformation adds the scripts in memory; web-directory write permissions are unnecessary. Custom controls require the server-hosted web client. Native and separately hosted clients do not receive injected scripts.

Open **Dashboard → Plugins → Jelly QoL** in the sidebar for direct access to the settings.

## Settings tabs

### Media Hider

Administrators can search, hide and restore movies and entire series, and configure optional user groups. Visibility status appears beside the year/rating; the native three-dot menu provides hide/restore controls. Season and episode actions apply to the parent series.

Without groups, hidden titles remain administrator-only. With groups, select all non-administrator accounts or specific groups. Membership in any targeted group blocks access; administrators retain access. Deleting the final targeted group makes a title administrator-only.

Each group has an independent, optional one-time reveal date and time. Dates use the browser's time zone and are stored in UTC. **Jelly QoL → Reveal scheduled group titles** checks once a minute. Only the due group's restrictions are removed; other groups and administrator-only rules remain. The date is cleared after completion. Overdue dates are processed after startup.

Server tags and Jellyfin parental controls enforce visibility across clients. Existing unrelated tags and restrictions are preserved. Lists may need refreshing; existing playback and downloads are unaffected. **Restore all hidden titles before uninstalling.**

### QoL

Each function can be enabled separately:

- **Active-filter warnings:** the filter icon blinks while Jellyfin's native indicator reports active filters. No extra text is added to the toolbar. Animation can be disabled; reduced-motion preferences are respected. Active filter labels and category counts update live, including collapsed categories.
- **Right-click title menu:** forwards right-clicks on media cards to the native menu. Shift + right-click retains access to the browser menu. Inputs and players are unaffected.
- **Search order:** Movies → Series → Discover on Seerr. Missing sections are not created, and empty result sections are hidden. Seerr results still require the integration that provides them.
- **Notification icons:** replaces supported missing icon placeholders in Jellyfin Enhanced toasts with local SVGs. Jellyfin Enhanced is optional.
- **Pagination:** adds synchronized top/bottom controls to paginated Modern library views, forwarding actions to Jellyfin's native controls.

### Services

Two configurable header shortcuts, each with its own **name and URL**. Empty addresses hide individual shortcuts. Links are hidden on login/setup pages and open in a new tab. HTTP/HTTPS addresses without embedded credentials are accepted; no personal addresses are built into the plugin.

### Announcements

An optional home-page announcement, disabled by default. Configure its title, message, bullet points, button label/URL, top/bottom position, start/end dates, automatic hide duration, appearance limit, cooldown, counter-reset period, session repeats and remembered dismissal. Dates use the browser's time zone and are stored in UTC. Zero disables an individual numeric limit as described beside each field.

Use **Test** to preview the current form values before saving. The preview works with a disabled announcement, ignores dates and limits, and does not update appearance counters or dismissal state. Only the current administrator sees it.

Counters and dismissal are separate for each account **in each browser**. A changed message starts a new announcement. Content is rendered as plain text; arbitrary HTML and scripts are unsupported. Scheduling, limits and expiry are checked while the web client is open.

QoL, Services and Announcements preferences apply server-wide and reach other open web clients within 30 seconds. Filter state comes from the active Jellyfin library view in that browser. Visibility/group settings and all settings changes require an administrator; configured service links and announcements are available only to authenticated accounts.

Requires .NET 10. Internal assembly, plugin ID, configuration file and API paths retain their original identifiers for compatibility. GPL-3.0-only. The catalog thumbnail was edited with built-in imagegen; see [its prompt](assets/jelly-qol-prompt.txt).