import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            VStack(spacing: 8) {
                Text("Family Hub")
                    .font(AppFont.script(44))
                    .foregroundStyle(Palette.mintDeep)
                Text("Calendar, daycare runs, chores and groceries for the whole crew.")
                    .font(AppFont.body(16))
                    .foregroundStyle(Palette.inkMid)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: 10) {
                ForEach(["#5DB894", "#EE8FA8", "#F2C14E", "#6CC0CF"], id: \.self) { hex in
                    Circle().fill(Color(hex: hex)).frame(width: 18, height: 18)
                        .overlay(Circle().stroke(Palette.ink, lineWidth: 2))
                }
            }
            Spacer()
            SignInWithAppleButton(.signIn) { request in
                auth.prepare(request)
            } onCompletion: { result in
                Task { await auth.complete(result) }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            if let error = auth.errorMessage {
                Text(error).font(AppFont.body(13)).foregroundStyle(Palette.pinkDeep).multilineTextAlignment(.center)
            }
        }
        .padding(24)
    }
}

/// After signing in: enter the household invite code and pick who you are.
struct ClaimMemberView: View {
    @Environment(AuthService.self) private var auth
    @State private var code = ""
    @State private var people: [ClaimableAdult] = []
    @State private var searched = false
    @State private var busy = false

    var body: some View {
        Page {
            ScreenHeader(eyebrow: "One more step", title: "Who are you?")
            Text("Enter the household code from the Settings screen on the other phone (or the one printed when the database was set up).")
                .font(AppFont.body(14)).foregroundStyle(Palette.inkMid)

            VStack(alignment: .leading, spacing: 10) {
                Eyebrow("Household code")
                RetroTextField(placeholder: "e.g. E97352", text: $code) { Task { await find() } }
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                OutlineButton(title: busy ? "Looking…" : "Find my family") { Task { await find() } }
            }
            .card(Palette.mint)

            if !people.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow("I'm…")
                    ForEach(people) { p in
                        Button {
                            Task {
                                busy = true
                                await auth.claim(code: code, memberID: p.id)
                                busy = false
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Circle().fill(Color(hex: p.color)).frame(width: 34, height: 34)
                                    .overlay(Text(String(p.name.prefix(1))).font(AppFont.body(15, .bold)))
                                    .overlay(Circle().stroke(Palette.ink, lineWidth: 2))
                                Text(p.name).font(AppFont.body(17, .bold))
                                Spacer()
                                Image(systemName: "chevron.right")
                            }
                            .foregroundStyle(Palette.ink)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 56)
                            .background(Palette.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.line))
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else if searched {
                Text("No open spots for that code. Check it, or the person may already be linked.")
                    .font(AppFont.body(14)).foregroundStyle(Palette.pinkDeep)
            }

            if let error = auth.errorMessage {
                Text(error).font(AppFont.body(13)).foregroundStyle(Palette.pinkDeep)
            }

            Button("Sign out") { Task { await auth.signOut() } }
                .font(AppFont.body(14, .bold)).foregroundStyle(Palette.inkSoft)
                .frame(maxWidth: .infinity)
        }
    }

    private func find() async {
        let c = code.trimmingCharacters(in: .whitespaces)
        guard !c.isEmpty else { return }
        busy = true
        people = await auth.claimableAdults(code: c)
        searched = true
        busy = false
    }
}
