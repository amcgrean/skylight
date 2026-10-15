import SwiftUI

struct EventEditor: View {
    @Environment(HouseholdStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var draft: EventDraft
    @State private var confirmDelete = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Page {
                VStack(alignment: .leading, spacing: 12) {
                    Eyebrow("What")
                    RetroTextField(placeholder: "e.g. Grooming for the dog", text: $draft.title)
                    Eyebrow("Note (optional)")
                    RetroTextField(placeholder: "e.g. Bring the vaccine card", text: $draft.note)
                }
                .card(Palette.mint)

                VStack(alignment: .leading, spacing: 12) {
                    Eyebrow("When")
                    DatePicker("Day", selection: $draft.day, displayedComponents: .date)
                        .font(AppFont.body(15, .bold))
                    Toggle("All day", isOn: $draft.allDay)
                        .font(AppFont.body(15, .bold))
                        .tint(Palette.mintDeep)
                    if !draft.allDay {
                        DatePicker("Time", selection: $draft.time, displayedComponents: .hourAndMinute)
                            .font(AppFont.body(15, .bold))
                    }
                }
                .card(Palette.paper, bordered: true)

                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow("Tag people")
                    FlowLayout(spacing: 6) {
                        ForEach(store.members) { m in
                            let on = draft.tagIDs.contains(m.id)
                            Pill(label: m.name, selected: on, selectedFill: Color(hex: m.color), selectedText: Palette.ink,
                                 dotHex: on ? nil : m.color, systemImage: m.getsInvites ? "envelope" : nil) {
                                if on { draft.tagIDs.remove(m.id) } else { draft.tagIDs.insert(m.id) }
                            }
                        }
                    }
                    Text(invitePreview).font(AppFont.body(13)).foregroundStyle(Palette.mintText)
                }
                .card(Palette.paper, bordered: true)

                PrimaryButton(title: saving ? "Saving…" : (draft.existing == nil ? "Add a family event" : "Save changes")) {
                    guard !saving else { return }
                    saving = true
                    Task {
                        await store.saveEvent(draft)
                        saving = false
                        dismiss()
                    }
                }
                .disabled(draft.title.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(draft.title.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)

                if let existing = draft.existing {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Text("Delete event").font(AppFont.body(15, .bold)).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .confirmationDialog("Delete \(existing.title)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                        Button("Delete", role: .destructive) {
                            Task { await store.deleteEvent(existing); dismiss() }
                        }
                    } message: {
                        Text("Anyone invited will get a cancellation from Google Calendar.")
                    }
                }
            }
            .navigationTitle(draft.existing == nil ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private var invitePreview: String {
        let tagged = draft.tagIDs.compactMap { store.member($0) }.sorted { $0.sort < $1.sort }
        if tagged.isEmpty { return "No one tagged — it'll be tagged to the whole family." }
        let invited = tagged.filter(\.getsInvites).map(\.name)
        let tagOnly = tagged.filter { !$0.getsInvites }.map(\.name)
        var parts: [String] = []
        parts.append(invited.isEmpty ? "No email invites" : "Invites go to \(invited.joined(separator: " & "))")
        if !tagOnly.isEmpty { parts.append("\(tagOnly.joined(separator: ", ")) tagged only") }
        let adultsWithoutEmail = tagged.filter { $0.kind == .adult && !$0.getsInvites }.map(\.name)
        if !adultsWithoutEmail.isEmpty { parts.append("add an email for \(adultsWithoutEmail.joined(separator: " & ")) in Settings") }
        return parts.joined(separator: " · ")
    }
}
