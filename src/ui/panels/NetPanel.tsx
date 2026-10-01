import { useEffect, useState } from 'preact/hooks';
import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { itemName } from '../../systems/itemValue';
import { iconOf } from '../icons';
import type { ItemMap } from '../../net/protocol';

const DEFAULT_URL = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:8787';

export function NetPanel() {
  useGame();
  const net = game.net;
  const sim = game.sim!;
  const st = game.state!;
  const [url, setUrl] = useState(net.url || DEFAULT_URL);
  const [tab, setTab] = useState<'players' | 'chat' | 'post' | 'trade' | 'lb'>('players');
  const [msg, setMsg] = useState('');
  const [dm, setDm] = useState('');
  const [depMoney, setDepMoney] = useState(0);
  const [depItems, setDepItems] = useState<ItemMap>({});
  const [offerMoney, setOfferMoney] = useState(0);
  const [offerItems, setOfferItems] = useState<ItemMap>({});

  useEffect(() => {
    net.onVisit = (owner, plots) => {
      sim.building.loadVisit(owner, plots);
      game.closePanel();
    };
    return () => {
      net.onVisit = null;
    };
  }, []);
  useEffect(() => {
    if (tab === 'lb' && net.online) net.requestLeaderboard('earned');
  }, [tab]);

  const invTotals = new Map<string, number>();
  for (const s of st.inv.slots) if (s) invTotals.set(s.id, (invTotals.get(s.id) ?? 0) + s.n);

  if (!net.online) {
    return (
      <Panel title="Multiplayer">
        <div class="body">
          <div class="desc" style="margin-bottom:8px">
            Join a shared world: see other players, chat, trade through the secure Trading Post, visit
            friends' plots and climb the leaderboards. The server is authoritative for everything you deposit,
            trade or share. Your single-player save is never uploaded except what you deposit and your shared
            plots.
          </div>
          <div class="row">
            <input
              class="txt"
              style="flex:1"
              value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button class="btn good" disabled={net.status === 'connecting'} onClick={() => net.connect(url)}>
              {net.status === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {net.lastError && <div style="color:var(--bad);margin-top:6px">{net.lastError}</div>}
          <div class="desc" style="margin-top:10px">
            Run your own: <kbd>npm run server</kbd> (or the Dockerfile). Default address {DEFAULT_URL}.
          </div>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title={`Multiplayer — ${net.me?.name}`} wide>
      <div class="tabs">
        {(['players', 'chat', 'post', 'trade', 'lb'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {
              {
                players: `Players (${net.players.size})`,
                chat: 'Chat',
                post: 'Trading Post',
                trade: net.trade ? 'Trade ●' : net.incomingTrade ? 'Trade ❗' : 'Trade',
                lb: 'Leaderboards',
              }[t]
            }
          </div>
        ))}
        <div style="margin-left:auto;padding:6px">
          <button class="btn bad small" onClick={() => net.disconnect()}>
            Disconnect
          </button>
        </div>
      </div>
      <div class="body">
        {tab === 'players' && (
          <div>
            <div class="row" style="margin-bottom:8px">
              <label class="row">
                <input
                  type="checkbox"
                  checked={net.publicPlots}
                  onChange={(e) =>
                    net.send({ t: 'social', op: 'public', value: (e.target as HTMLInputElement).checked })
                  }
                />{' '}
                Anyone can visit my plots (otherwise friends only)
              </label>
              <button
                class="btn alt small"
                onClick={() => {
                  net.shareAllPlots(true);
                }}
              >
                Share plots now
              </button>
              {sim.building.visitOwner && (
                <button
                  class="btn bad small"
                  onClick={() => {
                    sim.building.clearVisit();
                    sim.player.teleport(0, 12);
                    game.closePanel();
                  }}
                >
                  Leave {sim.building.visitOwner}'s plots
                </button>
              )}
            </div>
            <div class="grid">
              {[...net.players.values()].map((p) => (
                <div class="card" key={p.id}>
                  <h4>🧑 {p.name}</h4>
                  <div class="desc">
                    {p.biome}
                    {p.vehicle ? ` · driving ${p.vehicle}` : ''}
                  </div>
                  <div class="row">
                    <button
                      class="btn small"
                      onClick={() => net.send({ t: 'trade', op: 'request', who: p.id })}
                    >
                      Trade
                    </button>
                    <button class="btn alt small" onClick={() => net.send({ t: 'visit', owner: p.id })}>
                      Visit plots
                    </button>
                    <button
                      class="btn alt small"
                      onClick={() => {
                        setTab('chat');
                        setDm(p.id);
                      }}
                    >
                      Whisper
                    </button>
                    <button
                      class="btn alt small"
                      onClick={() => net.send({ t: 'social', op: 'friend', who: p.id })}
                    >
                      ＋Friend
                    </button>
                    <button
                      class="btn bad small"
                      onClick={() => net.send({ t: 'social', op: 'block', who: p.id })}
                    >
                      Block
                    </button>
                  </div>
                </div>
              ))}
              {!net.players.size && <div class="desc">Nobody else is online right now.</div>}
            </div>
            <h4>Friends</h4>
            <div class="row">
              {net.friends.map((f) => (
                <span class="hud-chip">
                  {f.name}{' '}
                  <span class="clickable" onClick={() => net.send({ t: 'visit', owner: f.id })}>
                    🏠
                  </span>{' '}
                  <span
                    class="clickable"
                    onClick={() => net.send({ t: 'social', op: 'unfriend', who: f.id })}
                  >
                    ✕
                  </span>
                </span>
              ))}
              {!net.friends.length && <span class="desc">None yet</span>}
            </div>
            <h4>Blocked</h4>
            <div class="row">
              {net.blocked.map((f) => (
                <span class="hud-chip">
                  {f.name}{' '}
                  <span class="clickable" onClick={() => net.send({ t: 'social', op: 'unblock', who: f.id })}>
                    unblock
                  </span>
                </span>
              ))}
              {!net.blocked.length && <span class="desc">None</span>}
            </div>
          </div>
        )}
        {tab === 'chat' && (
          <div>
            <div style="height:260px;overflow:auto;background:#0004;border-radius:8px;padding:8px;margin-bottom:8px">
              {net.chat.map((c) => (
                <div style={c.whisper ? 'color:#e0a0ff' : ''}>
                  <b>{c.whisper ? (c.toName ? `to ${c.toName}` : `${c.from} whispers`) : c.from}:</b> {c.text}
                </div>
              ))}
            </div>
            <div class="row">
              <input
                class="txt"
                style="flex:1"
                value={msg}
                placeholder={dm ? 'Whisper…' : 'Say something…'}
                maxLength={200}
                onInput={(e) => setMsg((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && msg.trim()) {
                    net.say(msg, dm || undefined);
                    setMsg('');
                  }
                }}
              />
              <button
                class="btn small"
                onClick={() => {
                  if (msg.trim()) {
                    net.say(msg, dm || undefined);
                    setMsg('');
                  }
                }}
              >
                Send
              </button>
              {dm && (
                <button class="btn alt small" onClick={() => setDm('')}>
                  Public
                </button>
              )}
            </div>
          </div>
        )}
        {tab === 'post' && (
          <div>
            <div class="desc" style="margin-bottom:8px">
              The Trading Post is your server-side stash. Deposit goods and money to trade safely; withdraw
              them back into your save. Deposits can't exceed the earnings you've reported to the server.
            </div>
            <div class="row" style="margin-bottom:8px">
              <b>Server wallet:</b> <span class="money">{money(net.money)}</span>
              <b style="margin-left:12px">Stash:</b>{' '}
              {Object.entries(net.stash).map(([k, n]) => (
                <span
                  class="hud-chip clickable"
                  title="click: withdraw all"
                  onClick={() => net.withdraw(0, { [k]: n })}
                >
                  {iconOf(k)} {itemName(k)} ×{n}
                </span>
              ))}
            </div>
            <div class="row" style="margin-bottom:8px">
              <button class="btn small alt" disabled={!net.money} onClick={() => net.withdraw(net.money, {})}>
                Withdraw all money
              </button>
            </div>
            <h4>Deposit</h4>
            <div class="row">
              <span>Money</span>
              <input
                class="txt"
                type="number"
                min="0"
                style="width:120px"
                value={depMoney}
                onInput={(e) => setDepMoney(Number((e.target as HTMLInputElement).value))}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span class="desc">of {money(st.money)}</span>
            </div>
            <div class="row" style="margin:6px 0">
              {[...invTotals.entries()].slice(0, 30).map(([k, n]) => (
                <span
                  class={'hud-chip clickable'}
                  style={depItems[k] ? 'border-color:var(--amber)' : ''}
                  onClick={() =>
                    setDepItems((d) =>
                      d[k]
                        ? Object.fromEntries(Object.entries(d).filter(([x]) => x !== k))
                        : { ...d, [k]: n },
                    )
                  }
                >
                  {iconOf(k)} {itemName(k)} ×{n}
                </span>
              ))}
            </div>
            <button
              class="btn good"
              onClick={() => {
                if (net.deposit(depMoney, depItems)) {
                  setDepMoney(0);
                  setDepItems({});
                }
                game.bump(true);
              }}
            >
              Deposit selected
            </button>
          </div>
        )}
        {tab === 'trade' && (
          <div>
            {net.incomingTrade && (
              <div class="card" style="margin-bottom:8px">
                <h4>{net.incomingTrade.from} wants to trade</h4>
                <div class="row">
                  <button
                    class="btn good small"
                    onClick={() => net.send({ t: 'trade', op: 'accept', tid: net.incomingTrade!.tid })}
                  >
                    Accept
                  </button>
                  <button
                    class="btn bad small"
                    onClick={() => net.send({ t: 'trade', op: 'decline', tid: net.incomingTrade!.tid })}
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
            {net.trade ? (
              <div>
                <h4>Trading with {net.trade.with}</h4>
                <div class="grid" style="grid-template-columns:1fr 1fr">
                  <div class="card">
                    <b>You offer</b>
                    <div>
                      {money(net.trade.yours.money)} + {net.describeItems(net.trade.yours.items)}
                    </div>
                    {net.trade.youConfirmed && <div class="up">✔ you confirmed</div>}
                  </div>
                  <div class="card">
                    <b>They offer</b>
                    <div>
                      {money(net.trade.theirs.money)} + {net.describeItems(net.trade.theirs.items)}
                    </div>
                    {net.trade.theyConfirmed && <div class="up">✔ they confirmed</div>}
                  </div>
                </div>
                <div class="desc" style="margin:6px 0">
                  {net.trade.tax * 100}% tax applies to money you receive. Any change to either offer clears
                  confirmations.
                </div>
                <div class="row">
                  <span>Money</span>
                  <input
                    class="txt"
                    type="number"
                    min="0"
                    style="width:110px"
                    value={offerMoney}
                    onInput={(e) => setOfferMoney(Number((e.target as HTMLInputElement).value))}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  {Object.entries(net.stash).map(([k, n]) => (
                    <span
                      class="hud-chip clickable"
                      style={offerItems[k] ? 'border-color:var(--amber)' : ''}
                      onClick={() =>
                        setOfferItems((d) =>
                          d[k]
                            ? Object.fromEntries(Object.entries(d).filter(([x]) => x !== k))
                            : { ...d, [k]: n },
                        )
                      }
                    >
                      {itemName(k)} ×{n}
                    </span>
                  ))}
                </div>
                <div class="row" style="margin-top:8px">
                  <button
                    class="btn small"
                    onClick={() =>
                      net.send({
                        t: 'trade',
                        op: 'offer',
                        tid: net.trade!.tid,
                        money: offerMoney,
                        items: offerItems,
                      })
                    }
                  >
                    Update offer
                  </button>
                  <button
                    class="btn good small"
                    onClick={() => net.send({ t: 'trade', op: 'confirm', tid: net.trade!.tid })}
                  >
                    Confirm
                  </button>
                  <button
                    class="btn bad small"
                    onClick={() => net.send({ t: 'trade', op: 'cancel', tid: net.trade!.tid })}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              !net.incomingTrade && (
                <div class="desc">
                  No active trade. Pick a player on the Players tab and press Trade. Only goods in your
                  Trading Post stash can be traded.
                </div>
              )
            )}
          </div>
        )}
        {tab === 'lb' && (
          <div>
            <div class="row" style="margin-bottom:8px">
              {['earned', 'trees', 'worth', 'prestige'].map((b) => (
                <button
                  class={'btn small' + (net.leaderboard?.board === b ? '' : ' alt')}
                  onClick={() => net.requestLeaderboard(b)}
                >
                  {b}
                </button>
              ))}
            </div>
            {net.leaderboard?.rows.map((r, i) => (
              <div class="pricerow">
                <span>
                  #{i + 1} {r.name}
                </span>
                <b>{r.value.toLocaleString()}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
