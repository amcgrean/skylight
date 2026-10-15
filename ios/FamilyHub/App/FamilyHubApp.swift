import SwiftUI
import UIKit

@main
struct FamilyHubApp: App {
    @State private var auth = AuthService()

    init() {
        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor(Palette.paper)
        tab.shadowColor = UIColor(Palette.line)
        let item = UITabBarItemAppearance()
        let font = UIFont(name: "JosefinSans-Bold", size: 11) ?? .systemFont(ofSize: 11, weight: .bold)
        item.normal.titleTextAttributes = [.font: font, .foregroundColor: UIColor(Palette.inkSoft)]
        item.selected.titleTextAttributes = [.font: font, .foregroundColor: UIColor(Palette.pinkDeep)]
        item.normal.iconColor = UIColor(Palette.inkSoft)
        item.selected.iconColor = UIColor(Palette.pinkDeep)
        tab.stackedLayoutAppearance = item
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(.light)
                .tint(Palette.pinkDeep)
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @State private var store: HouseholdStore?

    var body: some View {
        ZStack {
            Palette.cream.ignoresSafeArea()
            switch auth.phase {
            case .starting:
                ProgressView().tint(Palette.mintDeep)
            case .signedOut:
                SignInView()
            case .needsLink:
                ClaimMemberView()
            case .ready:
                if let store {
                    MainTabs().environment(store)
                } else {
                    ProgressView().tint(Palette.mintDeep)
                }
            }
        }
        .task { await auth.start() }
        .onChange(of: auth.phase) { _, phase in
            if phase == .ready, store == nil { makeStore() }
            if phase == .signedOut { store?.stopListening(); store = nil }
        }
    }

    @MainActor
    private func makeStore() {
        let repo: Repository
        if let client = auth.client { repo = SupabaseRepository(client: client) } else { repo = DemoRepository() }
        let s = HouseholdStore(repo: repo)
        store = s
        Task {
            await s.load()
            s.startListening()
        }
    }
}

struct MainTabs: View {
    @Environment(HouseholdStore.self) private var store

    var body: some View {
        @Bindable var store = store
        Group {
            if !store.hasLoaded, let error = store.loadError {
                LoadErrorView(message: error) { Task { await store.load() } }
            } else if !store.hasLoaded {
                ProgressView().tint(Palette.mintDeep)
            } else {
                TabView(selection: $store.selectedTab) {
                    HomeView()
                        .tabItem { Label("Home", systemImage: "house") }.tag(AppTab.home)
                    CalendarView()
                        .tabItem { Label("Calendar", systemImage: "calendar") }.tag(AppTab.calendar)
                    ChoresView()
                        .tabItem { Label("Chores", systemImage: "checkmark.circle") }.tag(AppTab.chores)
                    ListsView()
                        .tabItem { Label("Lists", systemImage: "list.bullet") }.tag(AppTab.lists)
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = store.toast {
                ToastView(text: toast)
                    .padding(.bottom, 64)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .allowsHitTesting(false)
            }
        }
        .animation(.spring(duration: 0.3), value: store.toast)
    }
}

struct LoadErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("Couldn't load the family")
                .font(AppFont.script(24)).foregroundStyle(Palette.mintDeep)
            Text(message).font(AppFont.body(14)).foregroundStyle(Palette.inkSoft).multilineTextAlignment(.center)
            OutlineButton(title: "Try again", action: retry).frame(maxWidth: 220)
        }
        .padding(32)
    }
}

/// Shared page scaffold: cream background, scrolling content, consistent padding.
struct Page<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) { content }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Palette.cream)
    }
}
