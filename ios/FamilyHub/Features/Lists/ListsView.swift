import SwiftUI

struct ListsView: View {
    @Environment(HouseholdStore.self) private var store
    @State private var newItem = ""
    @State private var showScanner = false

    var body: some View {
        Page {
            ScreenHeader(eyebrow: "Shared with everyone", title: "Our lists")

            VStack(alignment: .leading, spacing: 10) {
                Text("Groceries · \(store.groceriesLeft) left").font(AppFont.body(16, .bold))
                HStack(spacing: 8) {
                    RetroTextField(placeholder: "Add an item", text: $newItem) { add() }
                    Button(action: add) {
                        Text("Add").font(AppFont.body(15, .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 16).frame(minHeight: 46)
                            .background(Palette.mintDeep, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                OutlineButton(title: "Scan a barcode", systemImage: "barcode.viewfinder") { showScanner = true }
                Text(addHint).font(AppFont.body(12)).foregroundStyle(Palette.pinkText)
            }
            .card(Palette.pink, padding: 14)

            ForEach(sections, id: \.title) { section in
                StoreSection(title: section.title, color: section.color, items: section.items)
            }

            if store.groceries.contains(where: \.checked) {
                Button { Task { await store.clearChecked() } } label: {
                    Text("Clear checked items").font(AppFont.body(14, .bold)).foregroundStyle(Palette.pinkDeep)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showScanner) { ScanSheet().environment(store) }
    }

    private var addHint: String {
        let typed = newItem.trimmingCharacters(in: .whitespaces)
        guard !typed.isEmpty else { return "Items sort by store. The app learns where each thing usually comes from." }
        if let s = store.suggestion(for: GroceryItem.key(for: typed)) {
            return "Goes on the \(s.store.name) list — learned from \(s.total) past trip\(s.total == 1 ? "" : "s")"
        }
        return "New item — tap its store chip after adding to teach the app"
    }

    private func add() {
        let name = newItem
        newItem = ""
        Task { await store.addGrocery(name: name) }
    }

    private struct StoreGroup {
        let title: String
        let color: String
        let items: [GroceryItem]
    }

    private var sections: [StoreGroup] {
        var out: [StoreGroup] = store.stores.compactMap { s in
            let items = store.groceries.filter { $0.storeID == s.id }
            return items.isEmpty ? nil : StoreGroup(title: s.name, color: s.color, items: items)
        }
        let loose = store.groceries.filter { $0.storeID == nil || store.store($0.storeID) == nil }
        if !loose.isEmpty { out.append(StoreGroup(title: "Pick a store", color: "#C9BBA3", items: loose)) }
        return out
    }
}

private struct StoreSection: View {
    @Environment(HouseholdStore.self) private var store
    let title: String
    let color: String
    let items: [GroceryItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Circle().fill(Color(hex: color)).frame(width: 12, height: 12)
                Text(title).font(AppFont.body(15, .bold))
                Spacer()
                Text("\(items.filter { !$0.checked }.count) left").font(AppFont.body(12, .bold)).foregroundStyle(Palette.inkSoft)
            }
            .padding(.bottom, 6)

            ForEach(items) { item in
                Divider().overlay(Palette.sand)
                GroceryRow(item: item)
            }
        }
        .card(Palette.paper, bordered: true, padding: 14)
    }
}

private struct GroceryRow: View {
    @Environment(HouseholdStore.self) private var store
    let item: GroceryItem

    var body: some View {
        let s = store.suggestion(for: item.productKey)
        let learned = s != nil && s?.store.id == item.storeID && (s?.trips ?? 0) >= 2
        HStack(spacing: 8) {
            Button { Task { await store.toggle(item) } } label: {
                HStack(spacing: 12) {
                    CheckCircle(done: item.checked, fill: Palette.mintDeep, square: true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.name).font(AppFont.body(16)).strikethrough(item.checked).opacity(item.checked ? 0.45 : 1)
                        if learned, let s {
                            Text("Learned · \(s.trips) of \(s.total) trips here")
                                .font(AppFont.body(11, .bold)).foregroundStyle(Palette.mintDeep)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .foregroundStyle(Palette.ink)
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Menu {
                ForEach(store.stores) { st in
                    Button {
                        Task { await store.setStore(item, st.id) }
                    } label: {
                        if st.id == item.storeID { Label(st.name, systemImage: "checkmark") } else { Text(st.name) }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Circle().fill(Color(hex: store.store(item.storeID)?.color ?? "#C9BBA3")).frame(width: 8, height: 8)
                    Text(store.store(item.storeID)?.name ?? "Store").font(AppFont.body(12, .bold))
                }
                .foregroundStyle(Palette.ink)
                .padding(.horizontal, 10).frame(minHeight: 32)
                .background(Palette.cream, in: Capsule())
                .overlay(Capsule().stroke(Palette.lineDark, lineWidth: 1.5))
            }
            .accessibilityLabel("Store: \(store.store(item.storeID)?.name ?? "none"). Change store")
        }
    }
}
