# Jellyfin Media Hider

![Media Hider](assets/thumbnail.png)

A **Jellyfin Server 12.1** plugin for administrators to control movie and series visibility, optionally using user groups and one-time reveal schedules.

## Install or update

Title-page controls use **[File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)**. Install its build for Jellyfin 12.1 first; version **3.0.2.0** has been tested.

1. Under **Dashboard → Plugins → Repositories**, add the File Transformation repository if needed:
   ```text
   https://www.iamparadox.dev/jellyfin/plugins/manifest.json
   ```
2. Install **File Transformation** from the catalog.
3. Add the **Media Hider** repository if needed:
   ```text
   https://raw.githubusercontent.com/Wardf1/JellyfinMediaHider/main/manifest.json
   ```
4. Install or update **Media Hider**, restart Jellyfin, and reload the web client. Use a hard refresh if an older interface is cached.

Existing hidden-title settings are preserved. Web-file ownership and write permissions do not need to change.

## Visibility controls

Administrators see a Material Icon and visibility description alongside a title's year and rating. The existing **three-dot menu** provides **Hide from users** and **Restore visibility**. Season and episode controls apply to the entire parent series.

The settings page under **Dashboard → Plugins → Media Hider** provides title search, audience changes, and restore-all controls. The interface follows the Jellyfin language: **Polish** for Polish locales, **English** otherwise. All visibility data, group settings and changes require administrator access.

## Optional user groups

**Without groups, hidden titles are visible only to administrators.**

Create a group in the plugin settings and select its non-administrator members. When hiding a title, choose all non-administrator accounts or one or more groups. Other accounts retain access. A user belonging to several groups remains blocked while any of their groups is targeted. Administrators always retain access.

Deleting the final group targeted by a title falls back to administrator-only visibility. Restoring a title explicitly removes its Media Hider restrictions.

## Optional per-group reveal schedule

Each group has its own optional **date and time**:

- Group A → date and time A.
- Group B → date and time B.

Dates are entered using the browser's local time zone and stored in UTC. Leave a group's field empty to disable its schedule. The Jellyfin scheduled task **Media Hider → Reveal scheduled group titles** checks once per minute by default; it can also be run manually in Scheduled Tasks.

When a group's date arrives, its group-specific title restrictions are removed. Other groups' restrictions and administrator-only rules remain. The schedule is one-time: its date is cleared and the completion time is recorded. An overdue schedule runs on the next task execution after the server starts. Adjusting or disabling the task's trigger affects when due schedules are processed.

## How it works

Server-side tags and Jellyfin parental controls enforce restrictions in web, TV and mobile clients. Seasons, episodes, new media and account changes are synchronized automatically. Existing unrelated tags and user restrictions are preserved. Changes made through the interface are applied before success is reported; background changes have a fallback check every 15 seconds. Open clients may need refreshing. Existing playback and downloaded copies are not stopped or removed.

File Transformation inserts the web script **in memory**, preserving other plugins' HTML and loaders. Media Hider does not write to the web directory at startup, during requests or on shutdown. Without File Transformation, the settings panel explains which dependency to install; panel-based management and server-side restrictions remain available. Native and separately hosted web clients do not receive the custom title-page controls.

## Before uninstalling

Click **Restore all titles** before uninstalling. Removing the plugin alone leaves saved restrictions in Jellyfin.

Requires Jellyfin 12.1 / .NET 10. File Transformation is required for title-page controls. No external services are required. Licensed under GPL-3.0-only. The catalog thumbnail was generated with imagegen; its prompt is in [assets/thumbnail-prompt.txt](assets/thumbnail-prompt.txt).
