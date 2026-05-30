// xim's tweak pack ; GNOME Shell extension
//
// Based on code and ideas from Unite (hardpixel), Notification Banner
// Position (Bruno Drugowick), Desaturated Tray Icons (cr1337), and Focus on
// Active Window (Hwaryong).

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {WindowMenu} from 'resource:///org/gnome/shell/ui/windowMenu.js';


// Mixes each pixel toward Rec.709 RMS grayscale.
const DesaturateEffect = GObject.registerClass({
    GTypeName: 'XimDesaturateEffect',
}, class DesaturateEffect extends Shell.GLSLEffect {
    _init(factor = 1.0) {
        super._init();
        this.setFactor(factor);
    }

    setFactor(value) {
        this._factor = value;
        this.set_uniform_float(this.get_uniform_location('factor'), 1, [value]);
        this.queue_repaint();
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT,
            'uniform float factor;',
            `float g = sqrt(dot(cogl_color_out.rgb * cogl_color_out.rgb,
                                vec3(0.2126, 0.7152, 0.0722)));
             cogl_color_out.rgb = mix(cogl_color_out.rgb, vec3(g),
                                      clamp(factor, 0.0, 1.0));`,
            false);
    }
});


const DBUS_IFACE = `<node>
  <interface name="org.gnome.Shell.Extensions.XimsTweakPack">
    <method name="GetCurrentWindowClasses">
      <arg type="as" direction="out" name="classes"/>
    </method>
  </interface>
</node>`;


// A plain popup that shows only the focused window's titlebar items, built
// from GNOME's own WindowMenu so it stays identical to the real titlebar menu.
class WindowOnlyMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor) {
        super(sourceActor, 0.5, St.Side.TOP);
    }

    // Match the native titlebar menu: reserve ornament space on every item so
    // labels align and the "Always on Top" check sits flush (windowMenu.js
    // does the same in its own addAction override).
    addAction(label, callback) {
        const item = super.addAction(label, callback);
        item.setOrnament(PopupMenu.Ornament.NONE);
        return item;
    }

    open(animate) {
        // Rebuild against the current window each open (items capture per-
        // window state). We run before super.open() takes the modal grab, so
        // focus_window is still the real window here.
        this.removeAll();
        const window = global.display.focus_window;
        if (window)
            WindowMenu.prototype._buildMenu.call(this, window);
        super.open(animate);
    }
}


// AppMenu containing
// 1. Titlebar right-click items (Take Screenshot, Always on Top, Close, etc.)
// 2. Open Windows list (if 2+ windows)
// 3. AppMenu items (New Window, Quit, etc.)
class WindowAppMenu extends AppMenu {
    constructor(sourceActor, showOpenWindows = true) {
        super(sourceActor);

        this._showOpenWindows = showOpenWindows;

        // AppMenu internals like  `_openWindowsHeader` and `_newWindowItem`
        // are created in AppMenu's constructor. I wanted to make three separate
        // headers, and thus hardcode the "Application" header's position to be
        // right bofore the "New Window" item. If these internals (or ordering)
        // changes, stuff will break / look ugly...
        this._winMenuHeader = new PopupMenu.PopupSeparatorMenuItem('Window');
        this.addMenuItem(this._winMenuHeader, 0);
        this._winMenuSection = new PopupMenu.PopupMenuSection();
        this.addMenuItem(this._winMenuSection, 1);

        this._appMenuHeader = new PopupMenu.PopupSeparatorMenuItem('Application');
        this.addMenuItem(this._appMenuHeader,
            this._getMenuItems().indexOf(this._newWindowItem));

        // Default theme shrinks the *first* child's label leading to
        // inconsistent header sizing, so hardcode a style.
        const headerStyle = 'font-weight: 700; font-size: 1em;';
        this._winMenuHeader.label.style = headerStyle;
        this._openWindowsHeader.label.style = headerStyle;
        this._appMenuHeader.label.style = headerStyle;
    }

    open(animate) {
        this._rebuildWindowSection();
        this._indentItems();
        super.open(animate);
    }

    // Suppress AppMenu's "Open Windows" list on !_showOpenWindows
    _updateWindowsSection() {
        if (this._showOpenWindows) {
            super._updateWindowsSection();
        } else {
            this._openWindowsHeader.hide();
        }
    }

    _rebuildWindowSection() {
        this._winMenuSection.removeAll();

        // Read the focused window directly. We run before super.open() takes
        // the modal grab, so focus_window is still the real window here (the
        // grab momentarily clears it, which is what the syncTitle guard is
        // for).
        const window = global.display.focus_window;
        this._winMenuHeader.visible = !!window;
        if (!window)
            return;

        WindowMenu.prototype._buildMenu.call(this._winMenuSection, window);
    }

    // indent all items and separator lines so they align, including space
    // sufficient for checkboxes on the lest. AppMenu builds its own items, and
    // we just hack them into the right shape.
    _indentItems() {
        const headers = [
            this._winMenuHeader, this._openWindowsHeader, this._appMenuHeader,
        ];
        const indent = items => {
            for (const item of items) {
                if (item instanceof PopupMenu.PopupMenuSection) {
                    indent(item._getMenuItems()); // recurse for sections
                } else if (headers.includes(item)) {
                    // section titles stay non-indented
                } else if (item instanceof PopupMenu.PopupBaseMenuItem &&
                           item._ornament === PopupMenu.Ornament.HIDDEN) {
                    // Add "Ornament" space to items to indent them
                    item.setOrnament(PopupMenu.Ornament.NONE);
                }
            }
        };
        indent(this._getMenuItems());
    }
}


function createTitleMenu(mode, sourceActor) {
    switch (mode) {
    case 'window':
        return new WindowOnlyMenu(sourceActor);
    case 'application':
        return new AppMenu(sourceActor);
    case 'both-no-open-windows':
        return new WindowAppMenu(sourceActor, false);
    default: // 'both'
        return new WindowAppMenu(sourceActor, true);
    }
}


const WindowTitleButton = GObject.registerClass(
class WindowTitleButton extends PanelMenu.Button {
    _init(mode) {
        super._init(0.0, null, true);

        this._app = null;

        this._label = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this._label);

        this.bind_property('reactive', this, 'can-focus', 0);
        this.reactive = false;

        const menu = createTitleMenu(mode, this);
        this.setMenu(menu);
        Main.panel.menuManager.addMenu(menu);

        this.add_style_class_name('panel-button');
    }

    setTitle(text) {
        this._label.set_text(text);
    }

    setApp(app) {
        // WindowOnlyMenu has no setApp; only AppMenu-based menus track an app.
        this._app = app;
        this.menu.setApp?.(app);
    }

    setMode(mode) {
        this.setMenu(createTitleMenu(mode, this));
        this.menu.setApp?.(this._app);
    }

    setReactive(reactive) {
        this.reactive = reactive;
    }

    setVisible(visible) {
        this.container.visible = visible;
    }

    destroy() {
        Main.panel.menuManager.removeMenu(this.menu);
        this.menu.setApp?.(null);
        this.setMenu(null);
        super.destroy();
    }
});


export default class XimsTweakPack extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._features = {};

        this._exportDbus();
        this._defineFeatures();

        for (const [key, feature] of Object.entries(this._features)) {
            if (this._settings.get_boolean(key))
                feature.enable();

            this._settings.connectObject(`changed::${key}`, () => {
                if (this._settings.get_boolean(key))
                    feature.enable();
                else
                    feature.disable();
            }, this);
        }
    }

    disable() {
        this._settings.disconnectObject(this);

        for (const feature of Object.values(this._features))
            feature.disable();
        this._features = {};

        this._unexportDbus();
        this._settings = null;
    }

    _exportDbus() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(DBUS_IFACE, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/gnome/shell/extensions/XimsTweakPack');
    }

    _unexportDbus() {
        if (this._dbusImpl) {
            this._dbusImpl.unexport();
            this._dbusImpl = null;
        }
    }

    GetCurrentWindowClasses() {
        const classes = new Set();
        for (const actor of global.get_window_actors()) {
            const type = actor.meta_window.get_window_type();
            if (type !== Meta.WindowType.NORMAL &&
                type !== Meta.WindowType.DIALOG &&
                type !== Meta.WindowType.MODAL_DIALOG)
                continue;
            const wmClass = actor.meta_window.get_wm_class();
            if (wmClass)
                classes.add(wmClass);
        }
        return new GLib.Variant('(as)', [[...classes].sort()]);
    }

    _defineFeatures() {
        this._features['clock-move-right'] = this._clockMoveRight();
        this._features['notification-position-right'] = this._notificationRight();
        this._features['grayscale-tray-icons'] = this._grayscaleTray();
        this._features['window-title-in-panel'] = this._windowTitle();
        this._features['style-inactive-windows'] = this._styleInactive();
    }

    // Move Clock Right
    _clockMoveRight() {
        let originalParent = null;
        let originalIndex = -1;

        return {
            _active: false,
            enable() {
                if (this._active) return;
                this._active = true;

                const dateMenu = Main.panel.statusArea['dateMenu'];
                if (!dateMenu)
                    return;

                const container = dateMenu.container;
                originalParent = container.get_parent();
                if (originalParent)
                    originalIndex = originalParent.get_children().indexOf(container);

                if (originalParent)
                    originalParent.remove_child(container);
                Main.panel._rightBox.insert_child_at_index(container, 0);
            },
            disable() {
                if (!this._active) return;
                this._active = false;

                const dateMenu = Main.panel.statusArea['dateMenu'];
                if (!dateMenu)
                    return;

                const container = dateMenu.container;
                const parent = container.get_parent();
                if (parent)
                    parent.remove_child(container);

                if (originalParent) {
                    const idx = Math.min(originalIndex, originalParent.get_children().length);
                    originalParent.insert_child_at_index(container, Math.max(0, idx));
                }

                originalParent = null;
                originalIndex = -1;
            },
        };
    }

    // Notifications Move Right
    _notificationRight() {
        let origAlignment = null;

        return {
            _active: false,
            enable() {
                if (this._active) return;
                this._active = true;

                origAlignment = Main.messageTray.bannerAlignment;
                Main.messageTray.bannerAlignment = Clutter.ActorAlign.END;
            },
            disable() {
                if (!this._active) return;
                this._active = false;

                if (origAlignment !== null)
                    Main.messageTray.bannerAlignment = origAlignment;
                origAlignment = null;
            },
        };
    }

    // Grayscale Tray Icons
    _grayscaleTray() {
        function addEffect(child) {
            if (!child.get_effect('xim-grayscale'))
                child.add_effect_with_name('xim-grayscale', new DesaturateEffect());
        }

        function removeEffect(child) {
            const effect = child.get_effect('xim-grayscale');
            if (effect)
                child.remove_effect(effect);
        }

        return {
            _active: false,
            enable() {
                if (this._active) return;
                this._active = true;

                for (const child of Main.panel._rightBox.get_children())
                    addEffect(child);

                Main.panel._rightBox.connectObject(
                    'child-added', (_box, child) => addEffect(child),
                    this);
            },
            disable() {
                if (!this._active) return;
                this._active = false;

                Main.panel._rightBox.disconnectObject(this);

                for (const child of Main.panel._rightBox.get_children())
                    removeEffect(child);
            },
        };
    }

    // Window Title in Panel

    _windowTitle() {
        const settings = this._settings;
        let button = null;
        let focusedWindow = null;
        const tracker = {};

        function syncTitle() {
            if (Main.sessionMode.isLocked)
                return;

            // Menu takes a modal grab, which moves focus to the menu. If that's
            // open, don't update the title or focus right now, or things go ...
            // weird. =)
            if (button?.menu.isOpen)
                return;

            if (focusedWindow)
                focusedWindow.disconnectObject(tracker);

            focusedWindow = global.display.focus_window;

            if (focusedWindow) {
                const title = focusedWindow.get_title();
                if (title)
                    button.setTitle(title.replace(/\r?\n|\r/g, ' '));

                const app = Shell.WindowTracker.get_default().get_window_app(focusedWindow);
                if (app)
                    button.setApp(app);

                button.setReactive(true);
                button.setVisible(!Main.overview.visibleTarget);

                focusedWindow.connectObject('notify::title', () => {
                    const t = focusedWindow.get_title();
                    if (t)
                        button.setTitle(t.replace(/\r?\n|\r/g, ' '));
                }, tracker);
            } else {
                button.setReactive(false);
                button.setVisible(false);
                focusedWindow = null;
            }
        }

        function syncVisibility() {
            if (button?.menu.isOpen)
                return;

            if (!focusedWindow)
                button.setVisible(false);
            else
                button.setVisible(!Main.overview.visibleTarget);
        }

        return {
            _active: false,
            enable() {
                if (this._active) return;
                this._active = true;

                button = new WindowTitleButton(settings.get_string('window-title-menu-mode'));
                Main.panel.addToStatusArea('xim-window-title', button, 1, 'left');

                global.display.connectObject(
                    'notify::focus-window', syncTitle, tracker);
                Main.overview.connectObject(
                    'showing', syncVisibility,
                    'hiding', syncVisibility,
                    tracker);
                settings.connectObject('changed::window-title-menu-mode',
                    () => button.setMode(settings.get_string('window-title-menu-mode')),
                    tracker);

                syncTitle();
            },
            disable() {
                if (!this._active) return;
                this._active = false;

                global.display.disconnectObject(tracker);
                Main.overview.disconnectObject(tracker);
                settings.disconnectObject(tracker);
                if (focusedWindow)
                    focusedWindow.disconnectObject(tracker);
                focusedWindow = null;

                if (button) {
                    button.destroy();
                    button = null;
                }
            },
        };
    }

    // Style Inactive Windows
    _styleInactive() {
        const settings = this._settings;
        const tracker = {};
        let unredirectAllowed = true;
        let targetOpacity, targetBrightness, targetDesatFactor;
        let filterIsAllowlist, filterList;
        let skipAbove, skipFullscreen, skipMaxH, skipMaxV, skipSticky;
        let suspendUnredirect;

        function loadSettings() {
            targetOpacity = Math.round(((100 - settings.get_int('diw-inactive-transparency')) / 100) * 255);
            targetBrightness = (settings.get_int('diw-inactive-darkness') / 100) * -1.0;
            targetDesatFactor = Math.pow(settings.get_int('diw-inactive-desaturation') / 100.0, 0.5);

            filterIsAllowlist = settings.get_boolean('diw-filter-is-allowlist');
            filterList = settings.get_strv('diw-filter-app-list');
            skipAbove = settings.get_boolean('diw-skip-always-on-top');
            skipFullscreen = settings.get_boolean('diw-skip-fullscreen');
            skipMaxH = settings.get_boolean('diw-skip-maximized-horizontal');
            skipMaxV = settings.get_boolean('diw-skip-maximized-vertical');
            skipSticky = settings.get_boolean('diw-skip-sticky');
            suspendUnredirect = settings.get_boolean('diw-suspend-unredirect');
        }

        function applyStyle(actor, opacity, brightness, desatFactor) {
            actor.opacity = opacity;

            let bEffect = actor.get_effect('xim-brightness');
            if (brightness !== 0.0) {
                if (!bEffect) {
                    bEffect = new Clutter.BrightnessContrastEffect();
                    actor.add_effect_with_name('xim-brightness', bEffect);
                }
                bEffect.set_brightness(brightness);
            } else if (bEffect) {
                actor.remove_effect(bEffect);
            }

            let dEffect = actor.get_effect('xim-desaturate');
            if (desatFactor > 0.0) {
                if (!dEffect) {
                    dEffect = new DesaturateEffect(desatFactor);
                    actor.add_effect_with_name('xim-desaturate', dEffect);
                } else {
                    dEffect.setFactor(desatFactor);
                }
            } else if (dEffect) {
                actor.remove_effect(dEffect);
            }
        }

        function setUnredirectAllowed(allow) {
            if (allow === unredirectAllowed)
                return;
            unredirectAllowed = allow;

            // API changed at some time after Gnome 46, so check for both APIs
            const compositor = global.display.get_compositor?.();
            if (compositor?.enable_unredirect) { // Old API
                if (allow)
                    compositor.enable_unredirect();
                else
                    compositor.disable_unredirect();
            } else { // Newer API
                if (allow) {
                    Meta.enable_unredirect_for_display(global.display);
                } else {
                    Meta.disable_unredirect_for_display(global.display);
                }
            }
        }

        function updateAllWindows() {
            const focusWindow = global.display.focus_window;
            const styledWindows = [];
            let allowUnredirect = true;

            for (const actor of global.get_window_actors()) {
                const type = actor.meta_window.get_window_type();
                if (type !== Meta.WindowType.NORMAL &&
                    type !== Meta.WindowType.DIALOG &&
                    type !== Meta.WindowType.MODAL_DIALOG)
                    continue;

                const wmClass = actor.meta_window.get_wm_class();
                const isFocused = focusWindow && actor.meta_window === focusWindow;

                const isExcluded =
                    (skipAbove && actor.meta_window.is_above()) ||
                    (skipFullscreen && actor.meta_window.is_fullscreen()) ||
                    (skipMaxH && actor.meta_window.maximized_horizontally) ||
                    (skipMaxV && actor.meta_window.maximized_vertically) ||
                    (skipSticky && actor.meta_window.is_on_all_workspaces()) ||
                    (filterIsAllowlist
                        ? !filterList.includes(wmClass)
                        : filterList.includes(wmClass));

                const willStyle = !isFocused && !isExcluded;
                styledWindows.push({actor, willStyle});

                if (suspendUnredirect && willStyle &&
                    (actor.meta_window.is_fullscreen() ||
                     (actor.meta_window.maximized_horizontally &&
                      actor.meta_window.maximized_vertically)))
                    allowUnredirect = false;
            }

            setUnredirectAllowed(allowUnredirect);

            for (const {actor, willStyle} of styledWindows) {
                if (willStyle)
                    applyStyle(actor, targetOpacity, targetBrightness, targetDesatFactor);
                else
                    applyStyle(actor, 255, 0.0, 0.0);
            }
        }

        function resetAllWindows() {
            for (const actor of global.get_window_actors()) {
                actor.opacity = 255;
                const b = actor.get_effect('xim-brightness');
                if (b) actor.remove_effect(b);
                const d = actor.get_effect('xim-desaturate');
                if (d) actor.remove_effect(d);
            }
        }

        return {
            _active: false,
            enable() {
                if (this._active) return;
                this._active = true;

                loadSettings();

                global.display.connectObject(
                    'notify::focus-window', updateAllWindows,
                    'window-created', (_display, metaWin) => {
                        const type = metaWin.get_window_type();
                        if (type === Meta.WindowType.NORMAL ||
                            type === Meta.WindowType.DIALOG ||
                            type === Meta.WindowType.MODAL_DIALOG)
                            updateAllWindows();
                    },
                    tracker);
                settings.connectObject('changed', (_s, key) => {
                    if (key.startsWith('diw-')) {
                        loadSettings();
                        updateAllWindows();
                    }
                }, tracker);

                updateAllWindows();
            },
            disable() {
                if (!this._active) return;
                this._active = false;

                global.display.disconnectObject(tracker);
                settings.disconnectObject(tracker);

                setUnredirectAllowed(true);

                resetAllWindows();
            },
        };
    }
}
