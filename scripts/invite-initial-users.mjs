const configuration = {
  url: String(process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  appUrl: process.env.APP_URL || "https://importcustom.vercel.app",
};

if (!configuration.url || !configuration.serviceKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before inviting users.");
}

const users = [
  { fullName: "Senthil K", email: "senthil@datapower.co.in", role: "admin" },
  { fullName: "Selva S", email: "selva@ringke.co.in", role: "admin" },
  { fullName: "Joel B", email: "joel.bruno@exaktheit.in", role: "admin" },
];

for (const user of users) {
  const response = await fetch(`${configuration.url}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: configuration.serviceKey,
      Authorization: `Bearer ${configuration.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      data: { full_name: user.fullName, role: user.role, workspace_id: "00000000-0000-0000-0000-000000000001" },
      redirect_to: `${configuration.appUrl}/`,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Could not invite ${user.email}: ${data.msg || data.message || response.status}`);
  console.log(`Invited ${user.fullName} <${user.email}>`);
}
