import { useEffect, useRef, useState, useCallback } from 'react';
import { auth, onAuthStateChanged } from './firebase';
import type { User } from './firebase';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { SignIn } from './components/SignIn';
import { DeviceProvider, useDevice } from './context/DeviceContext';
import { ConnectDevice } from './components/ConnectDevice';
import { Dashboard } from './components/Dashboard';
import type { AppPage } from './types';

gsap.registerPlugin(ScrollTrigger);

const CARDS = [
  {
    id: 'card-1',
    tag: 'Smart Sensing',
    title: 'Environmental Intelligence',
    desc: 'Interprets what your sensors are really telling you — not just numbers, meaning.',
    image: '/images/card-sensing.jpg',
    color: '#1b4332',
    accent: '#2d6a4f',
    zIndex: 5,
  },
  {
    id: 'card-2',
    tag: 'AI Insights',
    title: 'Actionable Recommendations',
    desc: 'When to vent, irrigate, or shade — tailored for Indian growing conditions.',
    image: 'https://images.pexels.com/photos/2886932/pexels-photo-2886932.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200',
    color: '#7a5c3e',
    accent: '#a07d56',
    zIndex: 4,
  },
  {
    id: 'card-3',
    tag: 'Predictive Guard',
    title: 'Future Problem Detection',
    desc: 'Catches pest outbreaks, nutrient deficiencies, and heat stress before they hit.',
    image: 'https://images.pexels.com/photos/16678080/pexels-photo-16678080.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200',
    color: '#0e6655',
    accent: '#17a589',
    zIndex: 3,
  },
  {
    id: 'card-4',
    tag: 'AI Companion',
    title: 'Your Greenhouse Assistant',
    desc: 'An AI that understands your crops, climate, and greenhouse — all offline.',
    image: '/images/outro-field.jpg',
    color: '#5c3317',
    accent: '#8b5e3c',
    zIndex: 2,
  },
];

type LegalPage = 'privacy' | 'terms' | 'cookies' | 'disclaimer' | null;

const LEGAL: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      { heading: '1. Overview', body: 'GreenMind ("we", "us", or "our") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use the GreenMind application and related services.' },
      { heading: '2. Data We Collect', body: 'GreenMind is designed to operate entirely offline. The data we collect is limited to:\n\n• Sensor Data: Environmental readings (temperature, humidity, soil moisture, light levels, CO₂) collected from your greenhouse microcontroller via USB connection.\n• Usage Data: How you interact with the application, including features used and session duration. This data is stored locally on your device.\n• Device Information: Basic device identifiers and operating system version for compatibility purposes.\n\nWe do not collect your name, email address, phone number, or any other personally identifiable information unless you voluntarily provide it through our contact or support channels.' },
      { heading: '3. How We Use Your Data', body: '• To provide and improve the GreenMind decision-support system.\n• To generate AI-powered recommendations and predictive insights for your greenhouse.\n• To maintain historical environmental records for trend analysis.\n• To improve application performance and user experience.\n• To respond to support requests when you contact us.' },
      { heading: '4. Data Storage & Security', body: 'All sensor data and AI processing occurs locally on your device. No data is transmitted to external servers during normal operation. When connected via USB, data flows only between your microcontroller and the GreenMind application.\n\nWe implement reasonable technical measures to protect your data, including local encryption where applicable. However, no system is completely secure, and we cannot guarantee absolute security.' },
      { heading: '5. Data Sharing', body: 'We do not sell, rent, or share your personal data with third parties for marketing purposes. We may share anonymized, aggregated data for research or product improvement purposes only when it cannot be used to identify you individually.' },
      { heading: '6. Your Rights', body: 'You have the right to:\n• Access all data stored within the application on your device.\n• Delete your data at any time by clearing the application data or uninstalling the app.\n• Export your historical data for personal records.\n• Opt out of any optional data collection features.\n\nSince GreenMind operates offline and stores data locally, you maintain full control over your information at all times.' },
      { heading: "7. Children's Privacy", body: 'GreenMind is not directed at children under the age of 13. We do not knowingly collect personal information from children.' },
      { heading: '8. Changes to This Policy', body: 'We may update this Privacy Policy from time to time. Any changes will be reflected within the application and on our website. Continued use of GreenMind after changes constitutes acceptance of the updated policy.' },
      { heading: '9. Contact', body: 'If you have questions about this Privacy Policy or your data, please contact us at privacy@greenmind.in.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      { heading: '1. Acceptance of Terms', body: 'By downloading, installing, or using GreenMind ("the Application"), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must not use the Application.' },
      { heading: '2. Description of Service', body: 'GreenMind is an AI-powered offline greenhouse decision support system that connects to your greenhouse microcontroller via USB. It provides environmental monitoring, actionable recommendations, predictive analytics, and an AI assistant — all operating locally on your device without requiring an internet connection.' },
      { heading: '3. Acceptable Use', body: 'You agree to use GreenMind only for its intended purpose: supporting greenhouse management decisions. You must not:\n\n• Use the Application for any unlawful purpose.\n• Attempt to reverse-engineer, decompile, or disassemble the Application.\n• Modify, adapt, or create derivative works of the Application.\n• Use the Application in any way that could damage, disable, or impair its operation.\n• Remove or alter any proprietary notices within the Application.' },
      { heading: '4. User Responsibilities', body: "You are solely responsible for:\n• Ensuring your greenhouse microcontroller is compatible with GreenMind's USB connection requirements.\n• Maintaining the physical safety and regulatory compliance of your greenhouse operations.\n• Making final decisions regarding your crops, treatments, and greenhouse management. GreenMind provides decision support — not definitive instructions.\n• Backing up any data you wish to preserve." },
      { heading: '5. Intellectual Property', body: 'GreenMind and all its contents, features, and functionality — including but not limited to text, graphics, logos, icons, images, audio clips, software, and their compilation — are the exclusive property of GreenMind and are protected by international copyright, trademark, and other intellectual property laws.' },
      { heading: '6. Limitation of Liability', body: "GreenMind provides AI-generated recommendations and predictions for decision-support purposes only. We do not guarantee the accuracy, completeness, or reliability of any recommendations or predictions.\n\nTo the maximum extent permitted by applicable law, GreenMind shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to crop loss, reduced yield, pest damage, equipment damage, or financial loss arising from your use of or reliance on the Application.\n\nYou acknowledge that agricultural decisions involve inherent risks and that GreenMind is a support tool, not a substitute for professional agricultural advice." },
      { heading: '7. Disclaimer of Warranties', body: 'The Application is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Application will be uninterrupted, error-free, or free of harmful components.' },
      { heading: '8. Termination', body: 'We reserve the right to discontinue the Application at any time. You may stop using the Application at any time by uninstalling it from your device. Upon uninstallation, all locally stored data will be permanently deleted.' },
      { heading: '9. Governing Law', body: 'These Terms shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law provisions. Any disputes arising from these Terms or the use of the Application shall be resolved in the courts of India.' },
      { heading: '10. Changes to Terms', body: 'We reserve the right to modify these Terms at any time. Changes will be effective upon posting within the Application or on our website. Your continued use of the Application after any changes constitutes acceptance of the new Terms.' },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    sections: [
      { heading: '1. What Are Cookies', body: 'Cookies are small text files stored on your device when you visit a website or use a web-based application. They help the application remember your preferences and improve your experience.' },
      { heading: '2. How GreenMind Uses Cookies', body: "Since GreenMind is primarily an offline desktop application, our use of cookies is minimal and limited to:\n\n• Essential Cookies: Required for the application to function properly, including session management and security features.\n• Preference Cookies: Remember your settings and preferences within the application interface.\n\nWe do not use advertising cookies, tracking cookies, or third-party analytics cookies." },
      { heading: '3. Third-Party Services', body: 'If GreenMind integrates with any web-based services (such as our website or support portal), those services may set their own cookies. We encourage you to review the cookie policies of any third-party services you access through GreenMind.' },
      { heading: '4. Managing Cookies', body: 'You can control and manage cookies through your browser or device settings. Most browsers allow you to refuse cookies or delete existing cookies. Note that disabling essential cookies may affect the functionality of the application.' },
      { heading: '5. Updates', body: 'We may update this Cookie Policy from time to time. Any changes will be reflected within the application.' },
      { heading: '6. Contact', body: 'For questions about our use of cookies, contact us at privacy@greenmind.in.' },
    ],
  },
  disclaimer: {
    title: 'Disclaimer',
    sections: [
      { heading: 'Decision-Support Only', body: 'GreenMind is a decision-support tool designed to assist greenhouse owners in interpreting environmental data and making informed choices. The recommendations, predictions, and insights provided by the Application are generated by AI models and should not be considered as definitive agricultural, scientific, or professional advice.' },
      { heading: 'No Guarantee of Results', body: 'Agricultural outcomes depend on numerous factors beyond the scope of any software application, including but not limited to weather variability, soil conditions, pest behavior, seed quality, and human judgment. GreenMind does not guarantee specific yields, pest prevention, crop health, or financial outcomes.' },
      { heading: 'User Responsibility', body: 'You remain solely responsible for all decisions made in connection with your greenhouse operations. This includes but is not limited to:\n\n• Irrigation schedules and water management.\n• Ventilation, shading, and temperature control actions.\n• Pest and disease treatment decisions.\n• Fertilizer and nutrient application.\n• Crop selection and planting decisions.\n\nAlways consult with a qualified agricultural professional when making critical decisions about your crops and greenhouse operations.' },
      { heading: 'AI Limitations', body: 'The AI models used in GreenMind are trained on available agricultural data and may not account for all local conditions, crop varieties, or environmental factors. Predictions and recommendations may be inaccurate, incomplete, or inappropriate for your specific situation. The AI companion feature provides general guidance and should not be relied upon as a sole source of information.' },
      { heading: 'Hardware Compatibility', body: "GreenMind connects to greenhouse microcontrollers via USB. We do not manufacture or guarantee the performance of any microcontroller, sensor, or hardware device. Compatibility issues, sensor malfunctions, or hardware failures are beyond our control and are not the responsibility of GreenMind." },
      { heading: 'Force Majeure', body: 'GreenMind shall not be held liable for any failure or delay in performance due to circumstances beyond its reasonable control, including natural disasters, power outages, equipment failures, or any other events that prevent the Application from functioning as intended.' },
      { heading: 'Contact', body: 'For questions about this Disclaimer, contact us at legal@greenmind.in.' },
    ],
  },
};

/* ═══ MAIN APP ═══ */
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<AppPage>('landing');
  const { deviceState } = useDevice();

  // Listen to Firebase auth state — non-blocking, safe if Firebase isn't ready
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      const prevUser = user;
      setUser(u);
      if (u) {
        if (!prevUser) {
          setCurrentPage('connect');
        }
      } else {
        setCurrentPage('landing');
      }
    });
    return unsubscribe;
  }, [user]);

  const onOpenDashboard = useCallback(() => {
    if (user) {
      setCurrentPage(deviceState.connected ? 'dashboard' : 'connect');
    }
  }, [user, deviceState.connected]);

  // Routing
  if (currentPage === 'auth' && !user) {
    return <SignIn onBack={() => setCurrentPage('landing')} />;
  }

  if (currentPage === 'connect' && user) {
    return <ConnectDevice onBack={() => setCurrentPage('landing')} onNavigate={(page) => setCurrentPage(page)} />;
  }

  if (currentPage === 'dashboard' && user) {
    return <Dashboard onNavigate={(page) => setCurrentPage(page)} />;
  }

  return <LandingPage onGetStarted={() => setCurrentPage('auth')} user={user} onOpenDashboard={onOpenDashboard} />;
}

export function RootApp() {
  return (
    <DeviceProvider>
      <App />
    </DeviceProvider>
  );
}

/* ═══ LANDING PAGE ═══ */
function LandingPage({ onGetStarted, user, onOpenDashboard }: { onGetStarted: () => void; user: User | null; onOpenDashboard: () => void }) {
  const heroRef = useRef<HTMLElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layer2Ref = useRef<HTMLDivElement>(null);
  const layer3Ref = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>(null);
  const [navSolid, setNavSolid] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPage>(null);

  const closeLegal = useCallback(() => {
    setLegalPage(null);
    document.body.style.overflow = '';
  }, []);

  const openLegal = useCallback((page: LegalPage) => {
    setLegalPage(page);
    document.body.style.overflow = 'hidden';
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLegal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeLegal]);

  useEffect(() => {
    const lenis = new Lenis();
    const tickerCb = (time: number) => lenis.raf(time * 1000);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tickerCb);
    gsap.ticker.lagSmoothing(0);

    const onScroll = () => setNavSolid(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Parallax layers
    [
      { el: layer1Ref.current, y: 220 },
      { el: layer2Ref.current, y: 110 },
      { el: layer3Ref.current, y: 35 },
    ].forEach(({ el, y }) => {
      if (!el) return;
      gsap.to(el, {
        y, ease: 'none',
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 0.7 },
      });
    });

    // Hero content scroll fade
    if (heroContentRef.current) {
      gsap.to(heroContentRef.current, {
        y: 80, ease: 'none',
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: '60% top', scrub: 0.7 },
      });
    }

    // Hero entrance — animate FROM invisible TO visible (elements start visible in CSS)
    const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    heroTl
      .from('.hero-title', { y: 60, opacity: 0, duration: 1.2, delay: 0.3 })
      .from('.hero-subtitle', { y: 30, opacity: 0, duration: 0.9 }, '-=0.6')
      .from('.hero-cta-group', { y: 30, opacity: 0, duration: 0.9 }, '-=0.4')
      .from('.scroll-line', { opacity: 0, duration: 0.8 }, '-=0.3');

    // Sticky cards
    const cards = cardRefs.current ? Array.from(cardRefs.current).filter(Boolean) as HTMLDivElement[] : [];
    const totalCards = cards.length;
    const segmentSize = 1 / totalCards;

    cards.forEach((card, i) => {
      gsap.set(card, { xPercent: -50, yPercent: -50 + i * 5, scale: 1 - i * 0.075 });
    });

    ScrollTrigger.create({
      trigger: stickyRef.current,
      start: 'top top',
      end: `+=${window.innerHeight * 6}px`,
      pin: true, pinSpacing: true, scrub: 1,
      onUpdate: (self) => {
        const progress = self.progress;
        const activeIndex = Math.min(Math.floor(progress / segmentSize), totalCards - 1);
        const segProgress = (progress - activeIndex * segmentSize) / segmentSize;
        cards.forEach((card, i) => {
          if (i < activeIndex) {
            gsap.set(card, { yPercent: -250, rotationX: 35 });
          } else if (i === activeIndex) {
            gsap.set(card, {
              yPercent: gsap.utils.interpolate(-50, -200, segProgress),
              rotationX: gsap.utils.interpolate(0, 35, segProgress),
              scale: 1,
            });
          } else {
            const behind = i - activeIndex;
            gsap.set(card, {
              yPercent: -50 + (behind - segProgress) * 5,
              rotationX: 0,
              scale: 1 - (behind - segProgress) * 0.075,
            });
          }
        });
      },
    });

    // How steps
    document.querySelectorAll('.how-step').forEach((step, i) => {
      gsap.from(step, {
        scrollTrigger: { trigger: step, start: 'top 88%' },
        y: 50, opacity: 0, duration: 0.8, delay: i * 0.15,
      });
    });

    // Outro
    gsap.from('.outro-title', {
      scrollTrigger: { trigger: '.outro-section', start: 'top 75%' },
      y: 60, opacity: 0, duration: 1,
    });
    gsap.from('.outro-desc', {
      scrollTrigger: { trigger: '.outro-section', start: 'top 65%' },
      y: 30, opacity: 0, duration: 0.8, delay: 0.2,
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      gsap.ticker.remove(tickerCb);
      lenis.destroy();
      heroTl.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <main>
      {/* LEGAL MODAL */}
      {legalPage && LEGAL[legalPage] && (
        <div className="legal-overlay" onClick={closeLegal}>
          <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="legal-header">
              <h2>{LEGAL[legalPage].title}</h2>
              <button className="legal-close" onClick={closeLegal}>✕</button>
            </div>
            <div className="legal-body">
              {LEGAL[legalPage].sections.map((s, i) => (
                <div key={i} className="legal-section">
                  <h3>{s.heading}</h3>
                  {s.body.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              ))}
              <p className="legal-effective">Last updated: January 2026</p>
            </div>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav className={`gm-nav ${navSolid ? 'gm-nav-solid' : ''}`}>
        <div className="gm-nav-inner">
          <div className="gm-nav-links">
            <a href="#how">How It Works</a>
            <span className="nav-sep" />
            <a href="#legal">Legal</a>
            {user ? (
              <button className="nav-user" onClick={onOpenDashboard} style={{ background: 'none', cursor: 'pointer' }}>{user.email}</button>
            ) : (
              <button className="btn-primary btn-sm" onClick={onGetStarted}>Get Started</button>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section ref={heroRef} className="hero-parallax">
        <div className="hero-sky" />
        <div className="p-layer p-layer-1" ref={layer1Ref}>
          <img src="/images/hero-distant.jpg" alt="" draggable={false} />
        </div>
        <div className="p-layer p-layer-2" ref={layer2Ref}>
          <img src="/images/hero-greenhouse.jpg" alt="" draggable={false} />
        </div>
        <div className="p-layer p-layer-3" ref={layer3Ref}>
          <img src="/images/hero-foreground.jpg" alt="" draggable={false} />
        </div>
        <div className="hero-overlay" />
        <div className="hero-grain" />

        <div className="hero-content" ref={heroContentRef}>
          <h1 className="hero-title">Green<br /><span className="accent">Mind</span></h1>
          <p className="hero-subtitle">Smart decisions for your greenhouse, even without the internet.</p>
          <div className="hero-cta-group">
            {user ? (
              <button className="btn-primary" onClick={onOpenDashboard}>Open Dashboard <span className="arrow">→</span></button>
            ) : (
              <button className="btn-primary" onClick={onGetStarted}>
                Get Started <span className="arrow">→</span>
              </button>
            )}
            <button className="btn-secondary" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
              See How It Works
            </button>
          </div>
        </div>

        <div className="scroll-indicator"><div className="scroll-line" /></div>
      </section>

      {/* STICKY CARDS */}
      <section ref={stickyRef} className="sticky-cards-section">
        {CARDS.map((card, i) => (
          <div
            key={card.id}
            ref={(el) => { if (!cardRefs.current) cardRefs.current = []; cardRefs.current[i] = el; }}
            className="sticky-card"
            style={{ backgroundColor: card.color, zIndex: card.zIndex }}
          >
            <div className="card-col">
              <div>
                <p className="card-tag">{card.tag}</p>
                <h2 className="card-title">{card.title}</h2>
              </div>
              <p className="card-desc">{card.desc}</p>
            </div>
            <div className="card-col card-img-col" style={{ background: `linear-gradient(135deg, ${card.accent}22, ${card.accent}44)` }}>
              <img src={card.image} alt={card.title} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          </div>
        ))}
      </section>

      {/* HOW IT WORKS */}
      <section className="how-section" id="how">
        <div className="how-header">
          <h2>Plug In. <span className="accent">Grow Better.</span></h2>
          <p>Three steps, no cloud, no complexity.</p>
        </div>
        <div className="how-steps">
          <div className="how-step">
            <span className="step-num">01</span>
            <h3>Connect</h3>
            <p>Plug into your greenhouse microcontroller via USB. Sensors auto-detect instantly.</p>
          </div>
          <div className="how-step">
            <span className="step-num">02</span>
            <h3>Monitor</h3>
            <p>AI translates live sensor data into clear, actionable environmental insights.</p>
          </div>
          <div className="how-step">
            <span className="step-num">03</span>
            <h3>Optimize</h3>
            <p>Follow recommendations, catch problems early, and ask your AI assistant anything.</p>
          </div>
        </div>
      </section>

      {/* OUTRO */}
      <section className="outro-section">
        <div className="outro-bg">
          <img src="/images/section-wide.jpg" alt="" draggable={false} />
        </div>
        <h1 className="outro-title">Grow <span className="accent">Smarter</span>,<br />Not Harder</h1>
        <p className="outro-desc">AI-powered intelligence for every greenhouse in India. No internet. No expertise. Just better yields.</p>
        {user ? (
          <button className="btn-primary" style={{ position: 'relative', zIndex: 1 }} onClick={onOpenDashboard}>Open Dashboard <span className="arrow">→</span></button>
        ) : (
          <button className="btn-primary" style={{ position: 'relative', zIndex: 1 }} onClick={onGetStarted}>Start Growing Smarter <span className="arrow">→</span></button>
        )}
      </section>

      {/* FOOTER */}
      <footer className="footer" id="legal">
        <div className="footer-grid">
          <div className="footer-col">
            <h4 className="footer-col-title">GreenMind</h4>
            <p className="footer-col-desc">AI-powered offline greenhouse decision support, built for Indian farmers.</p>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Product</h4>
            <a href="#how" className="footer-link">How It Works</a>
            <a href="#" className="footer-link">Download</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Legal</h4>
            <button className="footer-link" onClick={() => openLegal('privacy')}>Privacy Policy</button>
            <button className="footer-link" onClick={() => openLegal('terms')}>Terms of Service</button>
            <button className="footer-link" onClick={() => openLegal('cookies')}>Cookie Policy</button>
            <button className="footer-link" onClick={() => openLegal('disclaimer')}>Disclaimer</button>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Contact</h4>
            <a href="mailto:support@greenmind.in" className="footer-link">support@greenmind.in</a>
            <a href="mailto:privacy@greenmind.in" className="footer-link">privacy@greenmind.in</a>
            <a href="mailto:legal@greenmind.in" className="footer-link">legal@greenmind.in</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 GreenMind. All rights reserved.</p>
          <div className="footer-bottom-links">
            <button onClick={() => openLegal('privacy')}>Privacy</button>
            <button onClick={() => openLegal('terms')}>Terms</button>
            <button onClick={() => openLegal('cookies')}>Cookies</button>
            <button onClick={() => openLegal('disclaimer')}>Disclaimer</button>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default RootApp;
