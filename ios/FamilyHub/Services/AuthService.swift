import Foundation
import AuthenticationServices
import CryptoKit
import Security
import Supabase

/// Reads Secrets.plist. If it's missing the app runs in Demo mode.
enum AppConfig {
    static let supabase: (url: URL, key: String)? = {
        guard let path = Bundle.main.path(forResource: "Secrets", ofType: "plist"),
              let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
              let urlString = dict["SupabaseURL"] as? String,
              let url = URL(string: urlString),
              let key = dict["SupabaseAnonKey"] as? String,
              !urlString.contains("YOUR-PROJECT"), !key.isEmpty
        else { return nil }
        return (url, key)
    }()
}

struct ClaimableAdult: Decodable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let color: String
}

/// Sign in with Apple → Supabase session → link the account to Aaron or Makala.
@MainActor
@Observable
final class AuthService {
    enum Phase: Equatable {
        case starting
        case signedOut
        case needsLink
        case ready
    }

    private(set) var phase: Phase = .starting
    var errorMessage: String?
    let client: SupabaseClient?
    private var currentNonce: String?

    var isDemo: Bool { client == nil }

    init() {
        if let cfg = AppConfig.supabase {
            client = SupabaseClient(supabaseURL: cfg.url, supabaseKey: cfg.key)
        } else {
            client = nil
        }
    }

    func start() async {
        guard let client else { phase = .ready; return }
        do {
            _ = try await client.auth.session
            await refreshLink()
        } catch {
            // A stored session that can't refresh right now (offline) shouldn't force a new sign-in;
            // if it's truly invalid, loading will fail and the retry screen appears.
            phase = client.auth.currentSession != nil ? .ready : .signedOut
        }
    }

    // MARK: Sign in with Apple

    func prepare(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = [.fullName]
        request.nonce = Self.sha256(nonce)
    }

    func complete(_ result: Result<ASAuthorization, Error>) async {
        guard let client else { return }
        errorMessage = nil
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { errorMessage = error.localizedDescription }
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = currentNonce
            else {
                errorMessage = "Apple didn't return a sign-in token. Try again."
                return
            }
            do {
                try await client.auth.signInWithIdToken(
                    credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce))
                await refreshLink()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: Linking to a family member

    func refreshLink() async {
        guard let client else { phase = .ready; return }
        do {
            let userID = try await client.auth.session.user.id
            let mine: [Member] = try await client.from("members").select()
                .eq("user_id", value: userID.uuidString).limit(1).execute().value
            phase = mine.isEmpty ? .needsLink : .ready
        } catch {
            // Offline or a timeout shouldn't sign anyone out: keep going if we still hold a session.
            if client.auth.currentSession != nil, (error is URLError || (error as NSError).domain == NSURLErrorDomain) {
                phase = .ready
            } else {
                errorMessage = error.localizedDescription
                phase = .signedOut
            }
        }
    }

    func claimableAdults(code: String) async -> [ClaimableAdult] {
        guard let client else { return [] }
        errorMessage = nil
        do {
            return try await client.rpc("unclaimed_adults", params: ["p_invite_code": code]).execute().value
        } catch {
            errorMessage = error.localizedDescription
            return []
        }
    }

    func claim(code: String, memberID: UUID) async {
        guard let client else { return }
        do {
            try await client.rpc("claim_member",
                                 params: ClaimParams(code: code, memberID: memberID)).execute()
            phase = .ready
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        guard let client else { return }
        await client.removeAllChannels()
        try? await client.auth.signOut()
        phase = .signedOut
    }

    // MARK: Nonce helpers

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

private struct ClaimParams: Encodable {
    let code: String
    let memberID: UUID
    enum CodingKeys: String, CodingKey {
        case code = "p_invite_code"
        case memberID = "p_member_id"
    }
}
