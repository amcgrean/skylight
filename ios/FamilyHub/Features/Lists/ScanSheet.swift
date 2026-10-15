import SwiftUI
import VisionKit
import AVFoundation

/// Scan a UPC → look it up → pick (or accept the learned) store → add to the list.
struct ScanSheet: View {
    @Environment(HouseholdStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var code: String?
    @State private var typedCode = ""
    @State private var looking = false
    @State private var name = ""
    @State private var found = false
    @State private var storeID: UUID?

    @State private var scannerAvailable = false
    @State private var checkedCamera = false

    var body: some View {
        NavigationStack {
            Page {
                if code == nil {
                    if scannerAvailable {
                        BarcodeScanner { scanned in handle(scanned) }
                            .frame(height: 240)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Palette.ink, lineWidth: 2))
                        Text("Point the camera at the barcode.").font(AppFont.body(14)).foregroundStyle(Palette.inkSoft)
                    } else if checkedCamera {
                        Text("The camera scanner isn't available here (Simulator or no camera permission). Type the number instead.")
                            .font(AppFont.body(14)).foregroundStyle(Palette.inkSoft)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow("Or type the number")
                        HStack(spacing: 8) {
                            RetroTextField(placeholder: "e.g. 036000411287", text: $typedCode) { handle(typedCode) }
                                .keyboardType(.numberPad)
                            Button("Look up") { handle(typedCode) }
                                .font(AppFont.body(15, .bold))
                                .foregroundStyle(Palette.mintDeep)
                        }
                    }
                    .card(Palette.paper, bordered: true)
                } else if looking {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Looking up \(code ?? "")…").font(AppFont.body(15, .bold))
                    }
                    .card(Palette.paper, bordered: true)
                } else {
                    resultCard
                }
            }
            .task {
                // isAvailable is false until camera access has been granted, so ask first.
                if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
                    _ = await AVCaptureDevice.requestAccess(for: .video)
                }
                scannerAvailable = DataScannerViewController.isSupported && DataScannerViewController.isAvailable
                checkedCamera = true
            }
            .navigationTitle("Scan a barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    @ViewBuilder private var resultCard: some View {
        let key = "upc:\(code ?? "")"
        let learned = store.suggestion(for: key)
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow(found ? "Found · UPC \(code ?? "")" : "Not in the database · UPC \(code ?? "")", color: Palette.mintDeep)
            RetroTextField(placeholder: "What is it?", text: $name)
            Text(learned.map { "Usually from \($0.store.name) — \($0.trips) of \($0.total) past trips" }
                 ?? "First time scanning this — pick a store and it'll remember.")
                .font(AppFont.body(13)).foregroundStyle(Palette.inkSoft)

            Eyebrow("Get it from")
            FlowLayout(spacing: 6) {
                ForEach(store.stores) { s in
                    Pill(label: s.name + (learned?.store.id == s.id ? " ★" : ""), selected: storeID == s.id, dotHex: s.color) {
                        storeID = s.id
                    }
                }
            }

            PrimaryButton(title: storeID.flatMap { store.store($0) }.map { "Add to \($0.name) list" } ?? "Pick a store",
                          fill: Palette.mintDeep) {
                guard let storeID, !name.trimmingCharacters(in: .whitespaces).isEmpty, let code else { return }
                let n = name
                Task {
                    await store.addGrocery(name: n, upc: code, storeID: storeID)
                    dismiss()
                }
            }
            .opacity(storeID == nil || name.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)

            Button("Scan another") { reset() }
                .font(AppFont.body(14, .bold)).foregroundStyle(Palette.pinkDeep)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .card(Palette.paper, bordered: true)
    }

    private func handle(_ raw: String) {
        var digits = raw.filter(\.isNumber)
        // Vision reports UPC-A as EAN-13 with a leading 0; normalize so scans and typed codes match.
        if digits.count == 13, digits.hasPrefix("0") { digits.removeFirst() }
        guard digits.count >= 8, code == nil else { return }
        code = digits
        looking = true
        storeID = store.suggestion(for: "upc:\(digits)")?.store.id
        Task {
            let info = await store.lookup(upc: digits)
            if let info, info.found, let n = info.name {
                if let b = info.brand, !b.isEmpty, !n.localizedCaseInsensitiveContains(b) {
                    name = "\(b) \(n)"
                } else {
                    name = n
                }
                found = true
            } else {
                name = ""
                found = false
            }
            looking = false
        }
    }

    private func reset() {
        code = nil; typedCode = ""; name = ""; found = false; storeID = nil
    }
}

/// VisionKit live barcode scanner. Calls `onCode` once with the first barcode it sees.
struct BarcodeScanner: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        if !vc.isScanning { try? vc.startScanning() }
    }

    static func dismantleUIViewController(_ vc: DataScannerViewController, coordinator: Coordinator) {
        vc.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var fired = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            guard !fired else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue {
                    fired = true
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    dataScanner.stopScanning()
                    onCode(value)
                    return
                }
            }
        }
    }
}
