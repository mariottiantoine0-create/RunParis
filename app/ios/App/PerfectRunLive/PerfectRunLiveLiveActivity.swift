// PerfectRun · carte de l'écran verrouillé et Dynamic Island (D-100), composant LiveActivity du design system.
// Toujours en thème Sombre : fond panel, texte ink, libellés muted, chiffres Archivo étroite 800 (title 30 px, stat-num 28 px),
// bouton principal 48 px (accent, texte accent-ink, radius-sm 4 px), barre de progression accent sur field.
import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

private enum DS {
    static let panel = Color(red: 0x17 / 255, green: 0x1A / 255, blue: 0x1F / 255)   // panel (sombre) #171A1F
    static let ink = Color(red: 0xF2 / 255, green: 0xF3 / 255, blue: 0xF5 / 255)     // ink (sombre) #F2F3F5
    static let muted = Color(red: 0x9A / 255, green: 0xA0 / 255, blue: 0xA8 / 255)   // muted (sombre) #9AA0A8
    static let accent = Color(red: 0x7B / 255, green: 0x96 / 255, blue: 0xFF / 255)  // accent (sombre) #7B96FF
    static let accentInk = Color(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0C / 255) // accent-ink (sombre) #0B0B0C
    static let field = Color(red: 0x22 / 255, green: 0x26 / 255, blue: 0x2C / 255)   // field (sombre) #22262C
    static func cond(_ s: CGFloat) -> Font { .custom("ArchivoCondensed-ExtraBold", size: s) }
    static func bold(_ s: CGFloat) -> Font { .custom("Archivo-Bold", size: s) }
}

// icônes du jeu (trait net : grille 24, trait 2,2 px, bouts carrés), dessinées en formes vectorielles
private struct IcoShape: Shape {
    let k: String
    func path(in r: CGRect) -> Path {
        let s = r.width / 24; var p = Path()
        func L(_ pts: [(CGFloat, CGFloat)]) { p.addLines(pts.map { CGPoint(x: r.minX + $0.0 * s, y: r.minY + $0.1 * s) }) }
        switch k {
        case "pause": p.addRect(CGRect(x: r.minX + 7 * s, y: r.minY + 4 * s, width: 3 * s, height: 16 * s)); p.addRect(CGRect(x: r.minX + 14 * s, y: r.minY + 4 * s, width: 3 * s, height: 16 * s))
        case "play": L([(7, 4), (20, 12), (7, 20)]); p.closeSubpath()
        case "right": L([(7, 21), (7, 12), (17, 12)]); L([(13, 8), (17, 12), (13, 16)])
        case "left": L([(17, 21), (17, 12), (7, 12)]); L([(11, 8), (7, 12), (11, 16)])
        case "straight": L([(12, 21), (12, 4)]); L([(7, 9), (12, 4), (17, 9)])
        default: p.addEllipse(in: CGRect(x: r.minX + 4 * s, y: r.minY + 5 * s, width: 16 * s, height: 16 * s)); L([(12, 9), (12, 13), (15, 15)]); L([(9, 2), (15, 2)])
        }
        return p
    }
}
private struct Ico: View {
    let k: String; var size: CGFloat = 18
    var body: some View { IcoShape(k: k).stroke(style: StrokeStyle(lineWidth: 2.2 * size / 24, lineCap: .square, lineJoin: .miter)).frame(width: size, height: size) }
}

@available(iOS 16.2, *)
private struct Stat: View {
    let label: String; var big = false; var value: String? = nil; var timer: Date? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let t = timer {
                // le chrono qui défile réserve toute la largeur possible : largeur fixe, sinon il pousse le reste hors de la carte
                Text(timerInterval: t...Date.distantFuture, countsDown: false)
                    .font(DS.cond(28)).monospacedDigit().foregroundColor(DS.ink).lineLimit(1).minimumScaleFactor(0.6)
                    .frame(width: 70, alignment: .leading)
            } else {
                Text(value ?? "").font(DS.cond(big ? 30 : 28)).monospacedDigit().foregroundColor(DS.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            Text(label).font(DS.bold(12)).foregroundColor(DS.muted).lineLimit(1)
        }
    }
}

@available(iOS 16.2, *)
private struct Toggle_: View {
    let st: LiveRunAttributes.ContentState
    var body: some View {
        let label = HStack(spacing: 8) { Ico(k: st.paused ? "play" : "pause", size: 18); Text(st.paused ? "Reprendre" : "Pause").font(DS.bold(16)) }
            .padding(.horizontal, 14).frame(height: 48).background(DS.accent).foregroundColor(DS.accentInk).clipShape(RoundedRectangle(cornerRadius: 4))
        if #available(iOS 17.0, *) { Button(intent: LiveRunToggleIntent(action: st.paused ? "resume" : "pause")) { label }.buttonStyle(.plain) }
        else { EmptyView() } // avant iOS 17 : affichage seul, toucher la carte ouvre l'app
    }
}

@available(iOS 16.2, *)
private struct Card: View {
    let st: LiveRunAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image("PRIcon").resizable().frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
                if st.turn != "chrono" && st.turn != "pause" { Ico(k: st.turn, size: 18).foregroundColor(DS.ink) }
                Text(st.head).font(DS.bold(15)).foregroundColor(DS.ink).lineLimit(1)
            }
            HStack(alignment: .bottom, spacing: 12) {
                HStack(alignment: .bottom, spacing: 12) {
                    Stat(label: st.kmLabel, big: true, value: st.km)
                    if st.paused { Stat(label: "temps arrêté", value: st.elapsed) } else { Stat(label: "temps", timer: st.start) }
                    if !st.paused { Stat(label: "allure", value: st.pace) }
                }
                Spacer(minLength: 0)
                Toggle_(st: st)
            }
            if st.progress >= 0 {
                GeometryReader { g in ZStack(alignment: .leading) { Rectangle().fill(DS.field); Rectangle().fill(DS.accent).frame(width: g.size.width * min(1, max(0, st.progress))) } }
                    .frame(height: 4).clipShape(RoundedRectangle(cornerRadius: 2))
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

@available(iOS 16.2, *)
struct PerfectRunLiveLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveRunAttributes.self) { ctx in
            Card(st: ctx.state).padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
                .activityBackgroundTint(DS.panel).activitySystemActionForegroundColor(DS.ink)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) { Card(st: ctx.state).padding(.horizontal, 4) }
            } compactLeading: {
                Image("PRIcon").resizable().frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
            } compactTrailing: {
                Text(ctx.state.km).font(DS.bold(15)).monospacedDigit().foregroundColor(DS.accent)
            } minimal: {
                Image("PRIcon").resizable().frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .keylineTint(DS.accent)
        }
    }
}
