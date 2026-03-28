import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class XimsTweakPackPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        page.add(this._buildPanelGroup(settings));

        const [styleGroup, ...styleRows] = this._buildStyleGroup(settings);
        page.add(styleGroup);

        const exemptGroup = this._buildExemptGroup(settings);
        page.add(exemptGroup);

        const filterGroup = this._buildFilterGroup(settings);
        page.add(filterGroup);

        // Disable inactive window styling options when the main toggle is off
        for (const widget of [...styleRows, exemptGroup, filterGroup])
            settings.bind('style-inactive-windows', widget, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    }

    _buildPanelGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Panel Tweaks'});

        const clockRow = new Adw.SwitchRow({title: 'Move clock to the right'});
        group.add(clockRow);
        settings.bind('clock-move-right', clockRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const notifRow = new Adw.SwitchRow({title: 'Notifications to the right'});
        group.add(notifRow);
        settings.bind('notification-position-right', notifRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const grayRow = new Adw.SwitchRow({title: 'Grayscale tray icons'});
        group.add(grayRow);
        settings.bind('grayscale-tray-icons', grayRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const titleRow = new Adw.SwitchRow({title: 'Window title in panel'});
        group.add(titleRow);
        settings.bind('window-title-in-panel', titleRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        return group;
    }

    _buildStyleGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Inactive Window Style',
            description: 'Visual effects applied to unfocused windows.',
        });

        const toggle = new Adw.SwitchRow({title: 'Style inactive windows'});
        group.add(toggle);
        settings.bind('style-inactive-windows', toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

        const desatRow = new Adw.SpinRow({
            title: 'Desaturation (%)',
            subtitle: '0 = full color, 100 = grayscale',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5}),
        });
        group.add(desatRow);
        settings.bind('diw-inactive-desaturation', desatRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const transparencyRow = new Adw.SpinRow({
            title: 'Transparency (%)',
            subtitle: '0 = fully visible, 100 = invisible',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5}),
        });
        group.add(transparencyRow);
        settings.bind('diw-inactive-transparency', transparencyRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const darknessRow = new Adw.SpinRow({
            title: 'Darkness (%)',
            subtitle: '0 = original brightness, 100 = black',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5}),
        });
        group.add(darknessRow);
        settings.bind('diw-inactive-darkness', darknessRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        return [group, desatRow, transparencyRow, darknessRow];
    }

    _buildExemptGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Window State Exemptions',
            description: 'Windows matching these states keep active styling.',
        });

        const skipAboveRow = new Adw.SwitchRow({title: 'Skip always-on-top windows'});
        group.add(skipAboveRow);
        settings.bind('diw-skip-always-on-top', skipAboveRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const skipFsRow = new Adw.SwitchRow({title: 'Skip fullscreen windows'});
        group.add(skipFsRow);
        settings.bind('diw-skip-fullscreen', skipFsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const skipMaxHRow = new Adw.SwitchRow({
            title: 'Skip horizontally maximized',
            subtitle: 'Includes tiled/snapped windows',
        });
        group.add(skipMaxHRow);
        settings.bind('diw-skip-maximized-horizontal', skipMaxHRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const skipMaxVRow = new Adw.SwitchRow({
            title: 'Skip vertically maximized',
            subtitle: 'Includes tiled/snapped windows',
        });
        group.add(skipMaxVRow);
        settings.bind('diw-skip-maximized-vertical', skipMaxVRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const skipStickyRow = new Adw.SwitchRow({
            title: 'Skip sticky windows',
            subtitle: 'Windows visible on all workspaces',
        });
        group.add(skipStickyRow);
        settings.bind('diw-skip-sticky', skipStickyRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        return group;
    }

    _buildFilterGroup(settings) {
        const modeDescription = (isAllowlist) => isAllowlist
            ? 'Only listed apps get inactive styling.'
            : 'Listed apps will **not** get inactive styling.';

        const group = new Adw.PreferencesGroup({
            title: 'Per-App Filtering',
            description: modeDescription(settings.get_boolean('diw-filter-is-allowlist')),
        });

        const filterModeRow = new Adw.ComboRow({
            title: 'Filter mode',
            model: new Gtk.StringList({strings: ['Denylist', 'Allowlist']}),
        });
        group.add(filterModeRow);

        filterModeRow.set_selected(settings.get_boolean('diw-filter-is-allowlist') ? 1 : 0);
        filterModeRow.connect('notify::selected', () => {
            const isAllowlist = filterModeRow.get_selected() === 1;
            settings.set_boolean('diw-filter-is-allowlist', isAllowlist);
            group.set_description(modeDescription(isAllowlist));
            rebuildAppList();
        });

        const addEntry = (wmClass) => {
            const list = settings.get_strv('diw-filter-app-list');
            if (!list.includes(wmClass)) {
                list.push(wmClass);
                settings.set_strv('diw-filter-app-list', list);
                rebuildAppList();
            }
        };

        const proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null,
            'org.gnome.Shell',
            '/org/gnome/shell/extensions/XimsTweakPack',
            'org.gnome.shell.extensions.XimsTweakPack',
            null,
        );

        const fetchWindowClasses = (callback) => {
            proxy.call('GetCurrentWindowClasses',
                null, Gio.DBusCallFlags.NONE, 1000, null,
                (_proxy, res) => {
                    try {
                        const result = proxy.call_finish(res);
                        callback(result.get_child_value(0).deepUnpack());
                    } catch {
                        callback([]);
                    }
                },
            );
        };

        let appListRows = [];

        const rebuildAppList = () => {
            for (const row of appListRows)
                group.remove(row);
            appListRows = [];

            const isAllowlist = settings.get_boolean('diw-filter-is-allowlist');
            const currentList = settings.get_strv('diw-filter-app-list');

            for (let i = 0; i < currentList.length; i++) {
                const app = currentList[i];
                const row = new Adw.ActionRow({title: app});
                const removeBtn = new Gtk.Button({
                    icon_name: 'edit-delete-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                });
                const idx = i;
                removeBtn.connect('clicked', () => {
                    const list = settings.get_strv('diw-filter-app-list');
                    list.splice(idx, 1);
                    settings.set_strv('diw-filter-app-list', list);
                    rebuildAppList();
                });
                row.add_suffix(removeBtn);
                group.add(row);
                appListRows.push(row);
            }

            const popover = new Gtk.Popover();
            const popoverBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
            popover.set_child(popoverBox);

            popover.connect('show', () => {
                let child;
                while ((child = popoverBox.get_first_child()))
                    popoverBox.remove(child);

                const spinner = new Gtk.Spinner({spinning: true});
                popoverBox.append(spinner);

                fetchWindowClasses(classes => {
                    spinner.spinning = false;
                    popoverBox.remove(spinner);

                    for (const wmClass of classes.filter(c => !currentList.includes(c))) {
                        const btn = new Gtk.Button({label: wmClass, css_classes: ['flat']});
                        btn.connect('clicked', () => { popover.popdown(); addEntry(wmClass); });
                        popoverBox.append(btn);
                    }
                });
            });

            const pickerBtn = new Gtk.MenuButton({
                popover,
                label: 'Pick…',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            const pickerRow = new Adw.ActionRow({
                title: isAllowlist
                    ? 'Add from running apps'
                    : 'Exclude a running app',
            });
            pickerRow.add_suffix(pickerBtn);
            group.add(pickerRow);
            appListRows.push(pickerRow);

            const manualRow = new Adw.EntryRow({
                title: isAllowlist
                    ? 'Or type a WM_CLASS to include…'
                    : 'Or type a WM_CLASS to exclude…',
                show_apply_button: true,
            });
            manualRow.connect('apply', () => {
                const text = manualRow.get_text().trim();
                if (text)
                    addEntry(text);
            });
            group.add(manualRow);
            appListRows.push(manualRow);
        };

        rebuildAppList();
        return group;
    }
}
