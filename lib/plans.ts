export type PlanKey = "starter" | "growth";

export const PLANS: Record<
  PlanKey,
  {
    name: string;
    price: string;
    maxMembers: number;
    maxLeads: number | null;
    blurb: string;
  }
> = {
  starter: {
    name: "Starter",
    price: "₦40,000 / month",
    maxMembers: 3,
    maxLeads: 500,
    blurb: "Solo installer or a team of up to 3. Up to 500 leads.",
  },
  growth: {
    name: "Growth",
    price: "₦110,000 / month",
    maxMembers: 10,
    maxLeads: null,
    blurb: "Up to 10 team members. Unlimited leads.",
  },
};

// Seats include the owner. The free trial gets Growth-sized limits.
export function memberLimit(plan: string): number {
  if (plan === "starter") return PLANS.starter.maxMembers;
  if (plan === "business") return 100;
  return PLANS.growth.maxMembers;
}
