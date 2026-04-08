import Foundation
import SwiftUI

@MainActor
@Observable
class ProjectsState {
    var projects: [DevDockProject] = []
    var isLoading = false
    var scanComplete = false

    // Filters
    var searchQuery = ""
    var typeFilter: String? = nil
    var statusFilter: String? = nil
    var tagFilter: String? = nil
    var sortMode = Preferences.sortMode
    var showDirtyOnly = false
    var techStackFilter: Set<String> = []

    // Selection
    var selectedProject: DevDockProject? = nil
    var focusedIndex = 0

    // View mode
    var viewMode = Preferences.viewMode // "grid" or "list"

    // Batch mode
    var batchMode = false
    var selectedIds: Set<String> = []

    // Derived
    var filteredProjects: [DevDockProject] {
        var result = projects

        // Search
        if !searchQuery.isEmpty {
            let q = searchQuery.lowercased()
            result = result.filter {
                $0.name.lowercased().contains(q) ||
                $0.type.lowercased().contains(q) ||
                $0.path.lowercased().contains(q) ||
                ($0.gitBranch?.lowercased().contains(q) ?? false) ||
                $0.aliases.contains(where: { $0.lowercased().contains(q) })
            }
        }

        // Type filter
        if let type = typeFilter {
            result = result.filter { $0.type == type }
        }

        // Status filter
        if let status = statusFilter {
            result = result.filter { $0.status == status }
        }

        // Tag filter
        if let tag = tagFilter {
            result = result.filter { $0.tags?.contains(tag) ?? false }
        }

        // Dirty only
        if showDirtyOnly {
            result = result.filter { $0.gitDirty }
        }

        // Tech stack filter
        if !techStackFilter.isEmpty {
            result = result.filter { project in
                guard let stack = project.techStack else { return false }
                return !techStackFilter.isDisjoint(with: Set(stack))
            }
        }

        // Exclude archived (unless viewing archive)
        result = result.filter { $0.status != "archived" }

        // Sort
        switch sortMode {
        case "name":
            result.sort { $0.name.lowercased() < $1.name.lowercased() }
        case "lastModified":
            result.sort { ($0.lastModified ?? "") > ($1.lastModified ?? "") }
        case "type":
            result.sort { $0.type < $1.type }
        default: // priority
            result.sort { ($0.priority ?? 99) < ($1.priority ?? 99) }
        }

        // Favorites first (within sort)
        let favs = result.filter(\.isFavorite)
        let rest = result.filter { !$0.isFavorite }
        return favs + rest
    }

    var archivedProjects: [DevDockProject] {
        projects.filter { $0.status == "archived" }
    }

    // Counts for sidebar
    var statusCounts: [String: Int] {
        var counts: [String: Int] = [:]
        for p in projects {
            counts[p.status, default: 0] += 1
        }
        return counts
    }

    var typeCounts: [String: Int] {
        var counts: [String: Int] = [:]
        for p in projects where p.status != "archived" {
            counts[p.type, default: 0] += 1
        }
        return counts
    }

    var tagCounts: [String: Int] {
        var counts: [String: Int] = [:]
        for p in projects {
            for tag in p.tags ?? [] {
                counts[tag, default: 0] += 1
            }
        }
        return counts
    }

    var techStackCounts: [String: Int] {
        var counts: [String: Int] = [:]
        for p in projects where p.status != "archived" {
            for tech in p.techStack ?? [] {
                counts[tech, default: 0] += 1
            }
        }
        return counts
    }

    var dirtyCount: Int {
        projects.filter(\.gitDirty).count
    }

    var hasActiveFilters: Bool {
        typeFilter != nil || statusFilter != nil || tagFilter != nil || showDirtyOnly || !techStackFilter.isEmpty || !searchQuery.isEmpty
    }

    // MARK: - Actions

    func refresh() async {
        isLoading = true
        projects = await APIClient.shared.fetchProjects()
        isLoading = false
    }

    func scan() async {
        isLoading = true
        scanComplete = false
        _ = await APIClient.shared.triggerScan()
        projects = await APIClient.shared.fetchProjects()
        isLoading = false
        scanComplete = true
        // Reset scan indicator after delay
        try? await Task.sleep(for: .seconds(2.5))
        scanComplete = false
    }

    func toggleFavorite(_ projectId: String) {
        Task {
            _ = await APIClient.shared.toggleFavorite(projectId: projectId)
            await refresh()
        }
    }

    func clearFilters() {
        typeFilter = nil
        statusFilter = nil
        tagFilter = nil
        showDirtyOnly = false
        techStackFilter = []
        searchQuery = ""
    }

    func setViewMode(_ mode: String) {
        viewMode = mode
        Preferences.viewMode = mode
    }

    func setSortMode(_ mode: String) {
        sortMode = mode
        Preferences.sortMode = mode
    }

    func selectProject(_ project: DevDockProject?) {
        selectedProject = project
    }

    func moveUp() {
        let count = filteredProjects.count
        guard count > 0 else { return }
        focusedIndex = (focusedIndex - 1 + count) % count
    }

    func moveDown() {
        let count = filteredProjects.count
        guard count > 0 else { return }
        focusedIndex = (focusedIndex + 1) % count
    }

    func selectFocused() {
        let projects = filteredProjects
        guard focusedIndex < projects.count else { return }
        selectedProject = projects[focusedIndex]
    }

    func toggleBatchSelection(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
    }
}
