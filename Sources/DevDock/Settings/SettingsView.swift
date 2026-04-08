import SwiftUI

struct SettingsView: View {
    @Binding var isPresented: Bool
    @State private var selectedTab = "commands"

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Button(action: { isPresented = false }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.tertiary)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(.white.opacity(0.06)))
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 20).padding(.vertical, 14)

            // Tabs
            HStack(spacing: 4) {
                ForEach(["commands", "shortcuts", "scanning", "about"], id: \.self) { tab in
                    Button(action: { selectedTab = tab }) {
                        Text(tab.capitalized)
                            .font(.system(size: 11))
                            .foregroundStyle(selectedTab == tab ? .white : .secondary)
                            .padding(.horizontal, 12).padding(.vertical, 5)
                            .background(RoundedRectangle(cornerRadius: 5).fill(selectedTab == tab ? .white.opacity(0.1) : .clear))
                    }.buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.bottom, 8)

            Divider().opacity(0.3)

            // Commands tab manages its own scroll/layout, others use scroll
            if selectedTab == "commands" {
                CustomCommandsTab()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        switch selectedTab {
                        case "shortcuts":
                            ShortcutsTab()
                        case "scanning":
                            ScanningTab()
                        case "about":
                            AboutTab()
                        default:
                            EmptyView()
                        }
                    }
                    .padding(20)
                }
            }
        }
        .frame(width: 560, height: 480)
        .background(
            RoundedRectangle(cornerRadius: 12).fill(.ultraThinMaterial)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.3), radius: 20, y: 5)
    }
}

// MARK: - Custom Commands Tab

struct CustomCommandsTab: View {
    @State private var commands: [CustomCommand] = []
    @State private var editingIndex: Int? = nil
    @State private var draftName = ""
    @State private var draftCommand = ""
    @State private var draftIcon = "terminal"
    @State private var showingNewForm = false

    private let commonIcons = ["terminal", "play.fill", "stop.fill", "trash", "folder", "network", "wifi", "bolt.fill", "square.grid.3x3", "dock.rectangle", "magnifyingglass", "internaldrive", "xmark.circle", "checkmark.circle", "gear", "hammer", "wrench.and.screwdriver", "arrow.clockwise", "arrow.up.circle", "arrow.down.circle", "doc.text", "lock", "key", "globe"]

    var body: some View {
        VStack(spacing: 0) {
            // Header bar with add button
            HStack {
                Text("CUSTOM COMMANDS")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .tracking(0.5)
                Spacer()
                Button(action: startNew) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 9, weight: .bold))
                        Text("Add Command")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(RoundedRectangle(cornerRadius: 5).fill(.blue.opacity(0.7)))
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 10)

            ScrollView {
                VStack(spacing: 6) {
                    if showingNewForm || editingIndex != nil {
                        CommandEditorForm(
                            name: $draftName,
                            command: $draftCommand,
                            icon: $draftIcon,
                            commonIcons: commonIcons,
                            onSave: saveDraft,
                            onCancel: cancelEdit
                        )
                    }

                    ForEach(Array(commands.enumerated()), id: \.element.id) { index, cmd in
                        CommandRow(
                            command: cmd,
                            isEditing: editingIndex == index,
                            onEdit: { startEdit(index: index) },
                            onDelete: { deleteCommand(at: index) }
                        )
                    }

                    if commands.isEmpty && !showingNewForm {
                        VStack(spacing: 8) {
                            Image(systemName: "terminal")
                                .font(.system(size: 28))
                                .foregroundStyle(.tertiary)
                            Text("No custom commands yet")
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                            Text("Add shortcuts to run shell commands from the palette")
                                .font(.system(size: 10))
                                .foregroundStyle(.tertiary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .onAppear { reload() }
    }

    private func reload() {
        CustomCommandStore.shared.load()
        commands = CustomCommandStore.shared.commands
    }

    private func startNew() {
        editingIndex = nil
        draftName = ""
        draftCommand = ""
        draftIcon = "terminal"
        showingNewForm = true
    }

    private func startEdit(index: Int) {
        let cmd = commands[index]
        editingIndex = index
        draftName = cmd.name
        draftCommand = cmd.command
        draftIcon = cmd.icon
        showingNewForm = false
    }

    private func saveDraft() {
        let trimmedName = draftName.trimmingCharacters(in: .whitespaces)
        let trimmedCommand = draftCommand.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty, !trimmedCommand.isEmpty else { return }

        let newCmd = CustomCommand(name: trimmedName, command: trimmedCommand, icon: draftIcon)
        if let index = editingIndex {
            CustomCommandStore.shared.update(newCmd, at: index)
        } else {
            CustomCommandStore.shared.add(newCmd)
        }
        cancelEdit()
        reload()
    }

    private func cancelEdit() {
        editingIndex = nil
        showingNewForm = false
        draftName = ""
        draftCommand = ""
        draftIcon = "terminal"
    }

    private func deleteCommand(at index: Int) {
        CustomCommandStore.shared.remove(at: index)
        reload()
    }
}

struct CommandRow: View {
    let command: CustomCommand
    let isEditing: Bool
    let onEdit: () -> Void
    let onDelete: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: command.icon)
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.7))
                .frame(width: 22, height: 22)
                .background(RoundedRectangle(cornerRadius: 5).fill(.white.opacity(0.06)))

            VStack(alignment: .leading, spacing: 2) {
                Text(command.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                Text(command.command)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer()

            if isHovered || isEditing {
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .frame(width: 22, height: 22)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.06)))
                }.buttonStyle(.plain)

                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .font(.system(size: 10))
                        .foregroundStyle(.red.opacity(0.8))
                        .frame(width: 22, height: 22)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.red.opacity(0.08)))
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isEditing ? Color.blue.opacity(0.1) : Color.white.opacity(isHovered ? 0.04 : 0.02))
        )
        .onHover { isHovered = $0 }
    }
}

struct CommandEditorForm: View {
    @Binding var name: String
    @Binding var command: String
    @Binding var icon: String
    let commonIcons: [String]
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Name
            VStack(alignment: .leading, spacing: 4) {
                Text("Name")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .tracking(0.5)
                TextField("Reset Launchpad", text: $name)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 5).fill(.white.opacity(0.05)))
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
            }

            // Command
            VStack(alignment: .leading, spacing: 4) {
                Text("Shell Command")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .tracking(0.5)
                TextField("killall Dock", text: $command)
                    .textFieldStyle(.plain)
                    .font(.system(size: 11, design: .monospaced))
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 5).fill(.black.opacity(0.25)))
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
            }

            // Icon picker
            VStack(alignment: .leading, spacing: 4) {
                Text("Icon")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .tracking(0.5)
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(28), spacing: 4), count: 12), spacing: 4) {
                    ForEach(commonIcons, id: \.self) { iconName in
                        Button(action: { icon = iconName }) {
                            Image(systemName: iconName)
                                .font(.system(size: 12))
                                .foregroundStyle(icon == iconName ? .white : .secondary)
                                .frame(width: 26, height: 26)
                                .background(RoundedRectangle(cornerRadius: 4).fill(icon == iconName ? Color.blue.opacity(0.5) : .white.opacity(0.04)))
                        }.buttonStyle(.plain)
                    }
                }
            }

            // Actions
            HStack {
                Spacer()
                Button(action: onCancel) {
                    Text("Cancel")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14).padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 5).fill(.white.opacity(0.06)))
                }.buttonStyle(.plain)
                Button(action: onSave) {
                    Text("Save")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 5).fill(.blue.opacity(0.7)))
                }.buttonStyle(.plain)
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || command.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.blue.opacity(0.3), lineWidth: 0.8))
    }
}

struct ShortcutsTab: View {
    private let shortcuts: [(String, String)] = [
        ("\u{2318}K", "Command Palette"),
        ("\u{2303}\u{21E7}D", "Global Hotkey (configurable)"),
        ("\u{2318}B", "Toggle Batch Mode"),
        ("\u{2318}1-5", "Switch Views"),
        ("\u{2191}\u{2193} / j/k", "Navigate Projects"),
        ("Enter", "Open Selected Project"),
        ("Escape", "Close Detail Panel"),
        ("e", "Open in Editor"),
        ("t", "Open Terminal"),
        ("f", "Open Finder"),
        ("/", "Focus Search"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("KEYBOARD SHORTCUTS")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(0.5)

            ForEach(shortcuts, id: \.0) { key, desc in
                HStack {
                    Text(key)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white)
                        .frame(width: 80, alignment: .trailing)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.06)))
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct ScanningTab: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SCANNING CONFIGURATION")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(0.5)

            Text("Edit ~/.devdock/config.json to configure scan paths, ignore directories, and auto-scan intervals.")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)

            Button(action: {
                let path = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".devdock/config.json").path
                Process.launchedProcess(launchPath: "/usr/bin/open", arguments: ["-t", path])
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text").font(.system(size: 10))
                    Text("Open config.json").font(.system(size: 11))
                }
                .foregroundStyle(.blue)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 5).fill(.blue.opacity(0.1)))
            }.buttonStyle(.plain)
        }
    }
}

struct AboutTab: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("DevDock")
                .font(.system(size: 16, weight: .bold))
            Text("Native macOS dev control plane")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            Text("Built with SwiftUI + Hono backend")
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
        }
    }
}
