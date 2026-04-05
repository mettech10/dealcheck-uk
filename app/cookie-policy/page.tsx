import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — Metalyzi",
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Cookie Policy</h1>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Last updated: 4 April 2026
      </p>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        This Cookie Policy explains how Metusa Property Ltd, trading as Metalyzi
        (company number 15651934, registered in England and Wales), uses cookies
        and similar technologies when you visit our website at{" "}
        <a
          href="https://www.metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          www.metalyzi.co.uk
        </a>
        . It explains what these technologies are, why we use them, and your
        rights to control our use of them.
      </p>

      {/* 1. What Are Cookies */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        1. What Are Cookies
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Cookies are small text files that are placed on your computer or mobile
        device when you visit a website. They are widely used to make websites
        work more efficiently, provide a better user experience, and supply
        information to website owners. Cookies can be &quot;session&quot; cookies,
        which are deleted when you close your browser, or &quot;persistent&quot;
        cookies, which remain on your device for a set period or until you delete
        them manually.
      </p>

      {/* 2. How We Use Cookies */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        2. How We Use Cookies
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We use cookies for the following purposes:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Essential functionality:</strong> To authenticate users, maintain
          sessions, and remember your cookie consent preferences. These cookies are
          strictly necessary for the website to function and cannot be switched off.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Analytics:</strong> With your consent, we use analytics cookies to
          understand how visitors interact with our website. This helps us improve
          our services and user experience. Analytics data is collected anonymously.
        </li>
      </ul>

      {/* 3. Types of Cookies We Use */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        3. Types of Cookies We Use
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        The following table lists the cookies used on our website:
      </p>

      <div className="mb-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left font-semibold text-foreground">
                Cookie Name
              </th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">
                Type
              </th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">
                Purpose
              </th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="px-4 py-3 text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  sb-*
                </code>
              </td>
              <td className="px-4 py-3 text-muted-foreground">Essential</td>
              <td className="px-4 py-3 text-muted-foreground">
                Supabase authentication session — used to keep you signed in and
                manage your authenticated session securely.
              </td>
              <td className="px-4 py-3 text-muted-foreground">Session</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="px-4 py-3 text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  metalyzi_consent
                </code>
              </td>
              <td className="px-4 py-3 text-muted-foreground">Essential</td>
              <td className="px-4 py-3 text-muted-foreground">
                Stores your cookie consent preference so we do not ask you
                repeatedly.
              </td>
              <td className="px-4 py-3 text-muted-foreground">1 year</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="px-4 py-3 text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  _va
                </code>
              </td>
              <td className="px-4 py-3 text-muted-foreground">Analytics</td>
              <td className="px-4 py-3 text-muted-foreground">
                Vercel Analytics — collects anonymous usage statistics to help us
                understand how visitors use the website. Only set with your
                consent.
              </td>
              <td className="px-4 py-3 text-muted-foreground">1 year</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. How to Manage Cookies */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        4. How to Manage Cookies
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        You can control and manage cookies through your browser settings. Most
        browsers allow you to refuse or delete cookies. The methods for doing so
        vary from browser to browser. Below are instructions for the most common
        browsers:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Google Chrome:</strong> Go to Settings &gt; Privacy and Security
          &gt; Cookies and other site data. From here you can block third-party
          cookies, block all cookies, or clear cookies when you close Chrome.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Mozilla Firefox:</strong> Go to Settings &gt; Privacy &amp;
          Security &gt; Cookies and Site Data. You can manage exceptions, clear
          data, and choose your preferred level of cookie blocking.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Safari:</strong> Go to Preferences &gt; Privacy. You can block
          all cookies, manage website data, and prevent cross-site tracking.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Microsoft Edge:</strong> Go to Settings &gt; Cookies and site
          permissions &gt; Manage and delete cookies and site data. You can block
          third-party cookies, block all cookies, or clear cookies on close.
        </li>
      </ul>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        You can also manage your cookie preferences on our website at any time
        through the cookie consent banner.
      </p>

      {/* 5. What Happens If You Disable Cookies */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        5. What Happens If You Disable Cookies
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        If you choose to disable cookies, please be aware that some parts of our
        website may not function correctly. Specifically:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          You will not be able to sign in or maintain an authenticated session, as
          the Supabase authentication cookies are essential for this functionality.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Your cookie consent preference will not be saved, meaning you may be
          asked to set your preferences each time you visit.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Disabling analytics cookies will not affect the core functionality of the
          website. You can decline analytics cookies without any impact on your
          ability to use our services.
        </li>
      </ul>

      {/* 6. Third-Party Cookies */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        6. Third-Party Cookies
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        In some cases, third-party services integrated into our website may set
        their own cookies. We do not control these cookies directly. Currently,
        the following third-party service may set cookies:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Stripe:</strong> When you proceed to checkout or make a payment,
          Stripe may set its own cookies to process your transaction securely and
          prevent fraud. These cookies are governed by{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            Stripe&apos;s Privacy Policy
          </a>
          .
        </li>
      </ul>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We encourage you to review the privacy and cookie policies of any
        third-party services you interact with through our website.
      </p>

      {/* 7. Changes to This Cookie Policy */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        7. Changes to This Cookie Policy
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We may update this Cookie Policy from time to time to reflect changes in
        our practices or for other operational, legal, or regulatory reasons. When
        we make changes, we will update the &quot;Last updated&quot; date at the
        top of this page. We encourage you to review this Cookie Policy
        periodically to stay informed about how we use cookies.
      </p>

      {/* 8. Contact Us */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        8. Contact Us
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        If you have any questions about our use of cookies or this Cookie Policy,
        please contact us:
      </p>
      <ul className="mb-4 list-none pl-0">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Company:</strong> Metusa Property Ltd, trading as Metalyzi
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Company number:</strong> 15651934 (registered in England and
          Wales)
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Address:</strong> 9D Worrall Street, Salford, Manchester, M5 4TZ
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Email:</strong>{" "}
          <a
            href="mailto:contact@metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
          >
            contact@metalyzi.co.uk
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Website:</strong>{" "}
          <a
            href="https://www.metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
          >
            www.metalyzi.co.uk
          </a>
        </li>
      </ul>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        You can also review our{" "}
        <Link
          href="/privacy-policy"
          className="text-primary underline hover:text-primary/80"
        >
          Privacy Policy
        </Link>{" "}
        for more information about how we handle your personal data.
      </p>
    </div>
  );
}
