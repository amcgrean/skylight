import SwiftUI

struct SettingsView: View {
    @Environment(HouseholdStore.self) private var store
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Page {
                if let h = store.household {
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow("Household code")
                        HStack {
                            Text(h.inviteCode).font(AppFont.body(28, .bold)).tracking(4)
                            Spacer()
                            Button {
                                UIPasteboard.general.string = h.inviteCode
                                store.flash("Code copied")
                            } label: {
                                Label("Copy", systemImage: "doc.on.doc").font(AppFont.body(14, .bold))
                            }
                        }
                        Text("The other adult signs in with Apple on their phone, enters this code and picks their name.")
                            .font(AppFont.body(13)).foregroundStyle(Palette.mintText)
                    }
                    .card(Palette.mint)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Eyebrow("Calendar invites")
                    Text("Tagged adults get Google Calendar invites at these addresses.")
                        .font(AppFont.body(13)).foregroundStyle(Palette.inkSoft)
                    ForEach(store.adults) { m in
                        EmailRow(member: m)
                    }
                }
                .card(Palette.paper, bordered: true)

                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow("Tag-only")
                    ForEach(store.members.filter { $0.kind != .adult }) { m in
                        HStack(spacing: 10) {
                            Avatar(member: m, size: 28)
                            Text(m.name).font(AppFont.body(15, .bold))
                            Spacer()
                            Text(m.kind == .grandparent ? "Pickups & sleepovers" : "Tags").font(AppFont.body(12)).foregroundStyle(Palette.inkSoft)
                        }
                    }
                }
                .card(Palette.paper, bordered: true)

                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow("Connection")
                    Text(store.isDemo ? "Demo mode — sample data stored only on this phone." : "Live — synced with the family database.")
                        .font(AppFont.body(14, .bold))
                    if !store.isDemo {
                        OutlineButton(title: "Sign out") {
                            dismiss()
                            Task { await auth.signOut() }
                        }
                    }
                }
                .card(Palette.paper, bordered: true)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct EmailRow: View {
    @Environment(HouseholdStore.self) private var store
    let member: Member
    @State private var email = ""
    @State private var loaded = false

    var body: some View {
        HStack(spacing: 10) {
            Avatar(member: member, size: 30)
            VStack(alignment: .leading, spacing: 4) {
                Text(member.name).font(AppFont.body(15, .bold))
                TextField("email@example.com", text: $email)
                    .font(AppFont.body(15))
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit(save)
            }
            if email != (member.email ?? "") {
                Button("Save", action: save).font(AppFont.body(14, .bold))
            }
        }
        .onAppear {
            if !loaded { email = member.email ?? ""; loaded = true }
        }
    }

    private func save() {
        let value = email
        Task {
            guard await store.updateEmail(member, value) else { return }
            store.flash(value.isEmpty ? "Email removed" : "Saved — \(member.name) will get invites")
        }
    }
}
