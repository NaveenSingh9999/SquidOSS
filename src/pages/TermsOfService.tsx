import React from 'react';
import { Download, ExternalLink, FileText, Mail, TriangleAlert } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import termsPdf from '../../cx/SquidCloud-Terms-of-Service-Final (1).pdf';

const linkClass = 'text-primary underline underline-offset-4 hover:opacity-80';
const sectionTitleClass = 'text-xl font-semibold md:text-2xl';

const TermsOfService = () => {
  const downloadPDF = () => {
    const link = document.createElement('a');
    link.href = termsPdf;
    link.download = 'SquidCloud-Terms-of-Service.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        <Card className="mb-8">
          <CardHeader className="gap-4 pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-3xl font-bold md:text-4xl">
                  <FileText className="h-6 w-6 text-primary" />
                  Terms of Service
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground md:text-base">
                  Version: Universal · Effective Date: 05 April 2026 · Last Updated: 05 April 2026
                </CardDescription>
              </div>
              <Button onClick={downloadPDF} className="w-full md:w-auto">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-8 text-sm leading-7 text-foreground md:text-base">
          <section className="space-y-4">
            <h2 className={sectionTitleClass}>1. Acceptance of Terms</h2>
            <p>
              By using SquidCloud services, including the web platform, API, CLI, and related features, you agree to
              these Terms of Service.
            </p>
            <p>
              If you do not agree, you must stop using SquidCloud immediately. Continued use after updates means
              acceptance of revised terms.
            </p>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>2. Eligibility</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>You must be at least 13 years of age.</li>
              <li>Users 13–18 must have awareness and consent of a parent or legal guardian.</li>
              <li>You must be capable of entering a binding agreement under applicable law.</li>
              <li>You must not be prohibited from using the service in your jurisdiction.</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>3. Free Service</h2>
            <p>
              SquidCloud is currently provided free of charge. We may introduce paid plans in the future with advance
              notice and clear communication.
            </p>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>4. Your Account</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>You are responsible for all activity under your account.</li>
              <li>Keep credentials and API keys private and revoke promptly if compromised.</li>
              <li>Provide accurate information and do not impersonate others.</li>
              <li>One account per person; bypassing restrictions via multiple accounts is prohibited.</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>5. Storage Options</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Native GitHub storage</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Client-side encryption and chunking create opaque JSON blobs stored in GitHub repositories.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">BYOS</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  External provider storage remains under your provider terms and your cost responsibility.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">BYOK</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Your encryption key never reaches SquidCloud; key loss cannot be recovered by us.
                </CardContent>
              </Card>
            </div>
            <p>
              GitHub Terms:{' '}
              <a
                href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"
                target="_blank"
                rel="noreferrer noopener"
                className={linkClass}
              >
                docs.github.com
              </a>
            </p>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>6. Acceptable Use</h2>
            <p>Permitted uses include personal/professional storage, automation, and API-based integrations.</p>
            <h3 className="text-lg font-semibold">6.1 Prohibited Content and Activities</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Pirated content, malware, fraud tooling, or illegal content.</li>
              <li>Hate speech, violence promotion, terrorism-related content, or abusive spam.</li>
              <li>Unauthorized access attempts, scraping beyond normal API use, or security bypasses.</li>
            </ul>
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Zero-tolerance rule</p>
                  <p>
                    CSAM and content sexualizing minors are strictly prohibited, trigger immediate permanent
                    termination, and are reported to relevant authorities without exception.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>7. Your Data and Files</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>You retain ownership of your uploaded and managed data.</li>
              <li>SquidCloud acts as a storage coordination platform and does not read your file content.</li>
              <li>You are responsible for lawfulness and rights to any content you store.</li>
              <li>Maintain independent backups; SquidCloud does not provide backup guarantees.</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>8. API and Developer Usage</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>API keys are account-scoped and API calls are logged for security.</li>
              <li>Rate limits are enforced for fair use and platform stability.</li>
              <li>BYOS third-party provider costs remain your responsibility.</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>9. Suspension, Deletion, and Termination</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Suspension and deletion requests are handled via verified email requests.</li>
              <li>Deletion permanently removes data controlled by SquidCloud.</li>
              <li>BYOS content must be deleted through the connected provider.</li>
              <li>Violations may result in suspension or permanent termination.</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>10. Liability, Law, and General Terms</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Service is provided &quot;as is&quot; and &quot;as available&quot;.</li>
              <li>No uptime guarantees are provided for this free, independently operated service.</li>
              <li>Total liability cap is INR 500, subject to non-excludable legal obligations.</li>
              <li>Terms are governed by the laws of India and applicable courts in India.</li>
              <li>If any clause is unenforceable, remaining clauses continue in full effect.</li>
            </ul>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className={sectionTitleClass}>11. Privacy Policy Link</h2>
            <p>
              Your use of SquidCloud is also governed by our Privacy Policy:{' '}
              <a
                href="https://squidcloud.vercel.app/privacy"
                target="_blank"
                rel="noreferrer noopener"
                className={linkClass}
              >
                squidcloud.vercel.app/privacy
              </a>
            </p>
          </section>

          <Separator />

          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <span className="font-medium">Email: </span>
                <a href="mailto:hellosquidcloud@gmail.com" className={linkClass}>
                  hellosquidcloud@gmail.com
                </a>
              </p>
              <p className="flex items-center gap-1">
                <span className="font-medium">Website: </span>
                <a
                  href="https://squidcloud.vercel.app"
                  target="_blank"
                  rel="noreferrer noopener"
                  className={linkClass}
                >
                  squidcloud.vercel.app
                </a>
                <ExternalLink className="h-4 w-4 text-primary" />
              </p>
              <div className="pt-1">
                <Badge variant="secondary">We aim to respond within 48 hours on business days.</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
