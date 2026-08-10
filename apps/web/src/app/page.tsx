import { MarketingHeader } from '@/components/marketing/Header';
import { Hero } from '@/components/marketing/Hero';
import { WorkflowSteps } from '@/components/marketing/WorkflowSteps';
import { CapabilityList } from '@/components/marketing/CapabilityList';
import { LocalFirstNote } from '@/components/marketing/LocalFirstNote';
import { MarketingFooter } from '@/components/marketing/Footer';

export default function HomePage() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <Hero />
        <WorkflowSteps />
        <CapabilityList />
        <LocalFirstNote />
      </main>
      <MarketingFooter />
    </>
  );
}
