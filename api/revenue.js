const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const EXCLUDED_EMAILS = ['jrdroyd@gmail.com', 'jeff@augeo-hq.com'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  try {
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 24 * 60 * 60;
    const monthAgo = now - 30 * 24 * 60 * 60;

    // Fetch charges from last 30 days
    const charges = await stripe.charges.list({
      created: { gte: monthAgo },
      limit: 100,
    });

    // Filter out Jeff's own test purchases
    const realCharges = charges.data.filter(charge => {
      const email = (charge.billing_details?.email || charge.receipt_email || '').toLowerCase();
      return charge.status === 'succeeded' && !EXCLUDED_EMAILS.includes(email);
    });

    const weekCharges = realCharges.filter(c => c.created >= weekAgo);
    const monthCharges = realCharges;

    const weekRevenue = weekCharges.reduce((sum, c) => sum + c.amount, 0) / 100;
    const monthRevenue = monthCharges.reduce((sum, c) => sum + c.amount, 0) / 100;

    // All time total
    let totalRevenue = 0;
    try {
      const balance = await stripe.balance.retrieve();
      // Sum all available + pending
      const avail = balance.available.reduce((s, b) => s + b.amount, 0);
      const pend = balance.pending.reduce((s, b) => s + b.amount, 0);
      totalRevenue = (avail + pend) / 100;
    } catch (e) {
      totalRevenue = monthRevenue;
    }

    const recentCharges = weekCharges.slice(0, 10).map(c => ({
      id: c.id,
      amount: c.amount / 100,
      currency: c.currency,
      description: c.description || c.metadata?.product || 'Purchase',
      date: new Date(c.created * 1000).toISOString(),
      email: c.billing_details?.email || c.receipt_email || 'unknown',
    }));

    res.json({
      weekRevenue,
      monthRevenue,
      weekTxns: weekCharges.length,
      monthTxns: monthCharges.length,
      totalRevenue,
      recentCharges,
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
