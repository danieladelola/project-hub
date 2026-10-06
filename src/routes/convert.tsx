import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountPage, Panel, Msg, errText } from "@/components/AccountPage";
import { convertCurrency, getFxQuote, listAccounts } from "@/lib/banking.functions";
import { formatMinor } from "@/lib/money";

export const Route = createFileRoute("/convert")({
  ssr: false,
  head: () => ({ meta: [{ title: "Convert Currency — Universal Crest" }, { name: "description", content: "Convert money securely between your Universal Crest currency accounts." }, { property: "og:title", content: "Convert Currency — Universal Crest" }, { property: "og:description", content: "Convert money securely between your Universal Crest currency accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: ConvertPage,
});

type Accounts = Awaited<ReturnType<typeof listAccounts>>;
const AMOUNT_RE = /^\d{1,13}(\.\d{1,2})?$/;
const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";

function ConvertPage() {
  const load = useServerFn(listAccounts);
  const quote = useServerFn(getFxQuote);
  const convert = useServerFn(convertCurrency);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [fromId, setFromId] = useState(0);
  const [toId, setToId] = useState(0);
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const refresh = () => load().then((a) => {
    const act = a.filter((x) => x.status === "active");
    setAccounts(act);
    setFromId((v) => v || act[0]?.id || 0);
    setToId((v) => v || act.find((x) => x.currency !== act[0]?.currency)?.id || 0);
  }).catch(() => setAccounts([]));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const src = accounts?.find((a) => a.id === fromId);
  const dst = accounts?.find((a) => a.id === toId);

  useEffect(() => {
    setRate(null);
    if (!src || !dst || src.currency === dst.currency) return;
    let live = true;
    const get = () => quote({ data: { from: src.currency as "USD", to: dst.currency as "USD" } }).then((r) => { if (live) r.ok ? setRate(r.rate) : setMsg({ ok: false, text: r.error }); }).catch(() => {});
    get();
    const t = setInterval(get, 60000);
    return () => { live = false; clearInterval(t); };
  }, [src?.currency, dst?.currency, quote]); // eslint-disable-line react-hooks/exhaustive-deps

  const amt = AMOUNT_RE.test(amount) ? Number(amount) : 0;
  const receive = rate && amt ? Math.floor(amt * 100 * rate) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!src || !dst || !rate) return;
    setBusy(true); setMsg(null);
    try {
      const r = await convert({ data: { fromAccountId: src.id, toAccountId: dst.id, amount, quotedRate: rate, pin, idempotencyKey: key } });
      if (r.ok) { setMsg({ ok: true, text: `Converted. ${r.credited ? `${r.credited} added to ${dst.nickname}. ` : ""}Reference ${r.reference}.` }); setAmount(""); setPin(""); setKey(crypto.randomUUID()); refresh(); }
      else setMsg({ ok: false, text: r.error });
    } catch (err) { setMsg({ ok: false, text: errText(err) }); } finally { setBusy(false); }
  }

  return (
    <AccountPage requireKyc title="Convert Currency" subtitle="Move money between your own currency accounts at the live market exchange rate.">
      <Panel title="Convert">
        {!accounts ? <p className="text-muted-foreground">Loading…</p> : accounts.length < 2 ? <p className="text-muted-foreground">You need at least two accounts in different currencies.</p> : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="from">From</Label>
              <select id="from" className={sel} value={fromId} onChange={(e) => setFromId(Number(e.target.value))}>
                 {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} · •••• {a.accountNumber.slice(-4)} · {a.currency}</option>)}
               </select>{src && <p className="text-sm text-muted-foreground">Available balance: <span className="font-medium text-foreground">{formatMinor(src.available, src.currency)}</span></p>}</div>
            <div className="flex justify-center"><Button type="button" variant="outline" size="icon" aria-label="Swap accounts" onClick={() => { setFromId(toId); setToId(fromId); }}><ArrowDownUp className="h-4 w-4" /></Button></div>
            <div className="space-y-2"><Label htmlFor="to">To</Label>
              <select id="to" className={sel} value={toId} onChange={(e) => setToId(Number(e.target.value))}>
                {accounts.filter((a) => a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{a.nickname} · {a.currency}</option>)}
              </select></div>
            <div className="space-y-2"><Label htmlFor="amt">Amount ({src?.currency})</Label><Input id="amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" /></div>
            <div className="rounded-md bg-secondary p-4 text-sm">
              {src && dst && src.currency === dst.currency ? <p>Both accounts use {src.currency}. Pick a different currency.</p> : !rate ? <p className="text-muted-foreground">Fetching live rate…</p> : (
                <>
                  <p>1 {src?.currency} = {rate.toFixed(4)} {dst?.currency} <span className="text-muted-foreground">· live rate, refreshes every minute</span></p>
                   <p className="mt-1 text-base font-semibold">You receive {dst ? formatMinor(String(receive), dst.currency) : "—"}</p>
                </>
              )}
            </div>
             <div className="space-y-2"><Label htmlFor="pin">Transaction PIN</Label><Input id="pin" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="h-11 max-w-40" /></div>
            <Button type="submit" className="h-11 w-full" disabled={busy || !rate || !amt || pin.length !== 4 || src?.currency === dst?.currency}>{busy ? "Converting…" : "Convert now"}</Button>
            <Msg msg={msg} />
          </form>
        )}
      </Panel>
    </AccountPage>
  );
}
