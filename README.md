# xim's tweak pack

A small collection of tweaks in one GNOME Shell extension.

Born from frustration with abandonware, bloated extensions and extension incompatability. I wanted a
single, reasonably-maintained extension that gave me exactly the features I wanted. So I shamelessly
ripped off a few extensions, added some of my own tweaks, and bundled it all together.


## Features

All features are independently toggleable in the preferences UI.

 * Move clock to the right
   - Shifts the clock to the right side of the panel
 * Notifications to the right
   - Moves notification banners to the right
 * Grayscale tray icons
   - Desaturates the elements in panel right box (indicators, etc.).
 * Window title in panel
   - Shows focused window's title in the panel with app menu
 * Style inactive windows
   - Dims, darkens, and/or desaturates a subset of unfocused windows
   - Configurable opacity, darkness, and desaturation levels
   - Optional exclusion for fullscreen, always-on-top, maximized, and sticky windows
   - Per-app filtering (allowlist/denylist)


## Installation

### From extensions.gnome.org

TODO will submit to extensions.gnome.org

### Manual

For updates/install, run `install.sh` and follow the instructions.

```sh
./install.sh
```


## Inspiration

This extension borrows heavily from the following projects:

 * [Unite](https://github.com/hardpixel/unite-shell)
   - Move clock to the right
   - Window title in panel
 * [Notification Banner Position](https://github.com/brunodrugowick/notification-position-gnome-extension)
   - Notifications to the right
 * [Desaturated Tray Icons](https://github.com/CR1337/desaturated-tray-icons)
   - Grayscale tray icons
 * [Focus on Active Window](https://github.com/dayliver/focus-on-active-window)
   - Style inactive windows


## License

[GPL-3.0](LICENSE)
