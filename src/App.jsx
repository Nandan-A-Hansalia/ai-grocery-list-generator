import { useState, useRef, useEffect } from "react";

const COLORS = {
  bg: "#0f1a0f", surface: "#162016", card: "#1c2b1c", border: "#2a3d2a",
  accent: "#6fcf4a", accentDim: "#4a9e2e", accentGlow: "rgba(111,207,74,0.18)",
  text: "#e8f5e3", textMuted: "#7fa872", textDim: "#4a6844", danger: "#e05252",
};
const font = "'Georgia', 'Times New Roman', serif";
const mono = "'Courier New', monospace";

const CATEGORY_ICONS = {
  produce:"🥦",fruits:"🍎",dairy:"🧀",meat:"🥩",seafood:"🐟",
  bakery:"🍞",grains:"🌾",pantry:"🫙",spices:"🌿",beverages:"🧃",
  frozen:"🧊",snacks:"🥜",condiments:"🫒",other:"🛒",
};
function catIcon(cat) {
  const k = cat.toLowerCase();
  for (const key of Object.keys(CATEGORY_ICONS)) if (k.includes(key)) return CATEGORY_ICONS[key];
  return "🛒";
}

const MEAL_TYPES = ["Breakfast","Lunch","Dinner","Snack","Dessert"];
const DIET_OPTS = ["None","Vegetarian","Vegan","Gluten-Free","Keto","Low-Carb","Dairy-Free","Paleo"];
const SERVING_OPTS = ["1","2","3","4","5","6","8","10"];
const SUGGESTIONS = [
  "Give me a 5-day keto meal plan grocery list",
  "Ingredients for chicken curry for 4 people",
  "Budget grocery list for a family of 4 for a week",
  "What can I cook with chicken, rice, and broccoli?",
  "Healthy vegan breakfast meal prep shopping list",
];

const API_KEY = "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";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const SYSTEM = "You are a domain-specific AI grocery and meal planning assistant. You ONLY help with meal planning, grocery shopping, ingredient lists, nutrition, cooking, recipes, and food-related topics. If asked ANYTHING outside this domain, politely decline and redirect to grocery or meal topics. Be friendly and helpful about food.";

async function callGroq(messages, jsonMode) {
  const systemMsg = { role: "system", content: SYSTEM + (jsonMode ? " Respond ONLY with valid JSON. No markdown, no backticks, no extra text." : "") };
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [systemMsg].concat(messages.map(function(m) { return { role: m.role === "assistant" ? "assistant" : "user", content: m.content }; })),
      max_tokens: 1000,
      temperature: 0.7
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ? data.error.message : "Groq API error");
  return data.choices[0].message.content || "";
}

function GroceryResult(props) {
  const result = props.result;
  const onCopy = props.onCopy;
  const copied = props.copied;
  const total = result.categories.reduce(function(s, c) { return s + c.items.length; }, 0);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
        <span style={{ fontFamily:mono, fontSize:"11px", color:COLORS.textMuted }}>{total} items / {result.categories.length} categories</span>
        <button onClick={onCopy} style={{ background:"transparent", color:COLORS.textMuted, border:"1px solid " + COLORS.border, borderRadius:"7px", fontFamily:mono, fontSize:"10px", padding:"6px 13px", cursor:"pointer" }}>
          {copied ? "COPIED" : "COPY LIST"}
        </button>
      </div>
      {result.categories.map(function(cat) {
        return (
          <div key={cat.name} style={{ marginBottom:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"7px", fontFamily:mono, fontSize:"11px", textTransform:"uppercase", color:COLORS.accentDim, marginBottom:"8px", paddingBottom:"5px", borderBottom:"1px solid " + COLORS.border }}>
              <span>{catIcon(cat.name)}</span>
              <span>{cat.name}</span>
              <span style={{ marginLeft:"auto", fontSize:"9px", color:COLORS.textDim }}>{cat.items.length} items</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"6px" }}>
              {cat.items.map(function(item, i) {
                return (
                  <div key={i} style={{ background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"8px", padding:"8px 11px", display:"flex", alignItems:"flex-start", gap:"8px" }}>
                    <span style={{ fontSize:"16px", minWidth:"19px" }}>{item.emoji}</span>
                    <div>
                      <div style={{ fontSize:"13px", fontWeight:"600", color:COLORS.text, marginBottom:"1px" }}>{item.name}</div>
                      <div style={{ fontSize:"11px", fontFamily:mono, color:COLORS.textMuted }}>{item.quantity}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {result.tips && (
        <div style={{ background:COLORS.surface, border:"1px solid " + COLORS.accentDim, borderRadius:"9px", padding:"13px 16px", marginTop:"14px" }}>
          <p style={{ margin:"0 0 5px", fontFamily:mono, fontSize:"9px", color:COLORS.accentDim }}>SHOPPING TIPS</p>
          <p style={{ margin:0, whiteSpace:"pre-line", fontSize:"13px", lineHeight:"1.8", color:COLORS.text }}>{result.tips}</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("planner");
  const [meals, setMeals] = useState([]);
  const [mealInput, setMealInput] = useState("");
  const [mealType, setMealType] = useState("Dinner");
  const [servings, setServings] = useState("4");
  const [diet, setDiet] = useState("None");
  const [restrictions, setRestr] = useState("");
  const [budget, setBudget] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [planError, setPlanError] = useState("");
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);
  const [history, setHistory] = useState([{
    role:"assistant",
    content:"Hi! I am your AI grocery and meal planning assistant. Ask me anything about groceries, recipes, or meal prep, or try a suggestion below!",
    grocery: null,
  }]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatCopied, setChatCopied] = useState(null);
  const bottomRef = useRef(null);

  useEffect(function() { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior:"smooth" }); }, [history, chatBusy]);

  function addMeal() {
    const n = mealInput.trim();
    if (!n) return;
    setMeals(function(p) { return [...p, { id:Date.now(), name:n, type:mealType, servings:servings }]; });
    setMealInput("");
  }

  function plannerPrompt() {
    return "Meal Plan:\n" + meals.map(function(m) { return "  - " + m.type + ": " + m.name + " (" + m.servings + " servings)"; }).join("\n") + "\n\nDiet: " + diet + ". Restrictions: " + (restrictions || "None") + ". Budget: " + budget + ".\n\nGenerate a complete organized grocery list. Respond in JSON only:\n{\"categories\":[{\"name\":\"Produce\",\"items\":[{\"emoji\":\"🥦\",\"name\":\"Broccoli\",\"quantity\":\"2 heads\"}]}],\"tips\":\"1. tip\\n2. tip\"}";
  }

  async function generate() {
    if (!meals.length) { setPlanError("Add at least one meal first."); return; }
    setPlanError(""); setResult(null); setLoading(true);
    try {
      const raw = await callGroq([{ role:"user", content: plannerPrompt() }], true);
      setResult(JSON.parse(raw.replace(/```json|```/gi,"").trim()));
      setTimeout(function() { if (resultRef.current) resultRef.current.scrollIntoView({ behavior:"smooth" }); }, 100);
    } catch(e) {
      setPlanError(e instanceof SyntaxError ? "Could not parse response. Try again." : e.message);
    }
    setLoading(false);
  }

  function copyPlanList() {
    if (!result) return;
    let t = "GROCERY LIST\n\n";
    for (const c of result.categories) {
      t += c.name.toUpperCase() + "\n";
      for (const i of c.items) t += "  " + i.emoji + " " + i.name + "  " + i.quantity + "\n";
      t += "\n";
    }
    navigator.clipboard.writeText(t).then(function() { setCopied(true); setTimeout(function() { setCopied(false); }, 2000); });
  }

  function isGrocery(t) {
    return /grocery|shopping list|ingredient|what do i need|buy |meal plan|recipe for|cook|make |prepare/i.test(t);
  }

  async function sendChat(override) {
    const text = (override || chatInput).trim();
    if (!text || chatBusy) return;
    setChatInput("");
    const next = [...history, { role:"user", content:text, grocery:null }];
    setHistory(next);
    setChatBusy(true);
    try {
      const apiMsgs = next.map(function(m) { return { role:m.role, content:m.content }; });
      let replyText = "";
      let grocery = null;
      if (isGrocery(text)) {
        const prompt = text + "\n\nRespond with JSON only:\n{\"message\":\"1-sentence friendly intro\",\"categories\":[{\"name\":\"Produce\",\"items\":[{\"emoji\":\"🥦\",\"name\":\"item\",\"quantity\":\"qty\"}]}],\"tips\":\"1. tip\\n2. tip\"}";
        const raw = await callGroq([...apiMsgs.slice(0,-1), { role:"user", content:prompt }], true);
        const p = JSON.parse(raw.replace(/```json|```/gi,"").trim());
        replyText = p.message || "Here is your grocery list!";
        grocery = { categories: p.categories, tips: p.tips };
      } else {
        replyText = await callGroq(apiMsgs, false);
      }
      setHistory(function(h) { return [...h, { role:"assistant", content:replyText, grocery:grocery }]; });
    } catch(e) {
      setHistory(function(h) { return [...h, { role:"assistant", content:"Something went wrong: " + e.message + ". Please try again.", grocery:null }]; });
    }
    setChatBusy(false);
  }

  function copyChatList(grocery, idx) {
    let t = "GROCERY LIST\n\n";
    for (const c of grocery.categories) {
      t += c.name.toUpperCase() + "\n";
      for (const i of c.items) t += "  " + i.emoji + " " + i.name + "  " + i.quantity + "\n";
      t += "\n";
    }
    navigator.clipboard.writeText(t).then(function() { setChatCopied(idx); setTimeout(function() { setChatCopied(null); }, 2000); });
  }

  function chip(active) {
    return {
      background: active ? COLORS.accentGlow : COLORS.surface,
      border: "1px solid " + (active ? COLORS.accent : COLORS.border),
      color: active ? COLORS.accent : COLORS.textMuted,
      borderRadius:"20px", fontFamily:mono, fontSize:"11px",
      padding:"5px 13px", cursor:"pointer", userSelect:"none",
    };
  }
  return (
    <div style={{ minHeight:"100vh", background:COLORS.bg, color:COLORS.text, fontFamily:font, margin:0 }}>
      <style>{`
        input:focus, textarea:focus, select:focus { border-color: #6fcf4a !important; outline: none; }
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
      `}</style>

      <header style={{ background:"#0a130a", borderBottom:"1px solid " + COLORS.border, padding:"20px 28px", display:"flex", alignItems:"center", gap:"14px" }}>
        <span style={{ fontSize:"30px" }}>🛒</span>
        <div style={{ flex:1 }}>
          <h1 style={{ margin:0, fontSize:"21px", fontWeight:"700", color:COLORS.accent }}>AI Grocery List Generator</h1>
          <p style={{ margin:"2px 0 0", fontSize:"11px", color:COLORS.textMuted, fontFamily:mono }}>meal plan to smart shopping list.</p>
        </div>
        <div style={{ background:COLORS.accentGlow, border:"1px solid " + COLORS.accentDim, color:COLORS.accent, borderRadius:"20px", padding:"4px 12px", fontSize:"10px", fontFamily:mono, textTransform:"uppercase" }}>
          Food and Nutrition AI
        </div>
      </header>

      <div style={{ display:"flex", borderBottom:"1px solid " + COLORS.border, background:COLORS.surface, maxWidth:"940px", margin:"0 auto" }}>
        {[["planner","Meal Planner"],["chat","Chat Assistant"]].map(function(item) {
          return (
            <button key={item[0]} onClick={function() { setTab(item[0]); }} style={{ padding:"13px 26px", cursor:"pointer", fontFamily:mono, fontSize:"11px", textTransform:"uppercase", color: tab===item[0] ? COLORS.accent : COLORS.textMuted, background:"none", border:"none", borderBottom: tab===item[0] ? "2px solid " + COLORS.accent : "2px solid transparent" }}>
              {item[1]}
            </button>
          );
        })}
      </div>

      <main style={{ maxWidth:"940px", margin:"0 auto", padding:"26px 18px 60px" }}>
        {tab === "planner" && (
          <div>
            <section style={{ background:COLORS.card, border:"1px solid " + COLORS.border, borderRadius:"12px", padding:"20px", marginBottom:"16px" }}>
              <p style={{ margin:"0 0 13px", fontSize:"11px", fontFamily:mono, color:COLORS.textMuted, textTransform:"uppercase" }}>Build Your Meal Plan</p>
              <div style={{ display:"flex", gap:"9px", flexWrap:"wrap", marginBottom:"9px" }}>
                <div style={{ flex:1, minWidth:"170px" }}>
                  <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:COLORS.textMuted, marginBottom:"5px", textTransform:"uppercase" }}>Meal name</label>
                  <input value={mealInput} onChange={function(e) { setMealInput(e.target.value); }} onKeyDown={function(e) { if (e.key==="Enter") addMeal(); }} placeholder="e.g. Chicken Stir Fry, Pasta..."
                    style={{ width:"100%", background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"8px", color:COLORS.text, fontFamily:font, fontSize:"14px", padding:"9px 12px", boxSizing:"border-box" }} />
                </div>
                <div>
                  <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:COLORS.textMuted, marginBottom:"5px", textTransform:"uppercase" }}>Type</label>
                  <select value={mealType} onChange={function(e) { setMealType(e.target.value); }} style={{ background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"8px", color:COLORS.text, fontFamily:font, fontSize:"13px", padding:"9px 12px", cursor:"pointer", minWidth:"120px" }}>
                    {MEAL_TYPES.map(function(t) { return <option key={t}>{t}</option>; })}
                  </select>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:COLORS.textMuted, marginBottom:"5px", textTransform:"uppercase" }}>Servings</label>
                  <select value={servings} onChange={function(e) { setServings(e.target.value); }} style={{ background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"8px", color:COLORS.text, fontFamily:font, fontSize:"13px", padding:"9px 12px", cursor:"pointer", minWidth:"80px" }}>
                    {SERVING_OPTS.map(function(s) { return <option key={s}>{s}</option>; })}
                  </select>
                </div>
                <div style={{ display:"flex", alignItems:"flex-end" }}>
                  <button onClick={addMeal} style={{ background:COLORS.accent, color:"#0a130a", border:"none", borderRadius:"8px", fontFamily:font, fontWeight:"700", fontSize:"13px", padding:"9px 20px", cursor:"pointer" }}>Add</button>
                </div>
              </div>
              {meals.length > 0 && (
                <div style={{ marginTop:"13px" }}>
                  {meals.map(function(m) {
                    return (
                      <div key={m.id} style={{ background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"7px", padding:"9px 13px", marginBottom:"6px", display:"flex", alignItems:"center", gap:"10px" }}>
                        <span style={{ fontFamily:mono, fontSize:"9px", textTransform:"uppercase", color:COLORS.accentDim, minWidth:"58px" }}>{m.type}</span>
                        <span style={{ flex:1, fontSize:"14px" }}>{m.name}</span>
                        <span style={{ fontFamily:mono, fontSize:"10px", color:COLORS.textMuted }}>{m.servings} srv</span>
                        <button onClick={function() { setMeals(function(p) { return p.filter(function(x) { return x.id !== m.id; }); }); }} style={{ background:"none", border:"none", color:COLORS.textDim, cursor:"pointer", fontSize:"14px", padding:"1px 4px" }}>x</button>
                      </div>
                    );
                  })}
                  <button onClick={function() { setMeals([]); }} style={{ background:"transparent", color:COLORS.textMuted, border:"1px solid " + COLORS.border, borderRadius:"5px", fontFamily:mono, fontSize:"10px", padding:"4px 10px", cursor:"pointer", marginTop:"4px" }}>CLEAR ALL</button>
                </div>
              )}
            </section>

            <section style={{ background:COLORS.card, border:"1px solid " + COLORS.border, borderRadius:"12px", padding:"20px", marginBottom:"16px" }}>
              <p style={{ margin:"0 0 13px", fontSize:"11px", fontFamily:mono, color:COLORS.textMuted, textTransform:"uppercase" }}>Preferences and Restrictions</p>
              <div style={{ marginBottom:"11px" }}>
                <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:COLORS.textMuted, marginBottom:"5px", textTransform:"uppercase" }}>Dietary preference</label>
                <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
                  {DIET_OPTS.map(function(d) { return <span key={d} style={chip(diet===d)} onClick={function() { setDiet(d); }}>{d}</span>; })}
                </div>
              </div>
              <div style={{ marginBottom:"11px" }}>
                <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:COLORS.textMuted, marginBottom:"5px", textTransform:"uppercase" }}>Allergies / Restrictions</label>
                <input value={restrictions} onChange={function(e) { setRestr(e.target.value); }} placeholder="e.g. No peanuts, no shellfish..."
                  style={{ width:"100%", background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"8px", color:COLORS.text, fontFamily:font, fontSize:"13px", padding:"9px 12px", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ display:"block", fontSize:"10px", fontFamily:mono, color:COLORS.textMuted, marginBottom:"5px", textTransform:"uppercase" }}>Budget level</label>
                <div style={{ display:"flex", gap:"6px" }}>
                  {[["low","Budget"],["medium","Regular"],["high","Premium"]].map(function(item) {
                    return <span key={item[0]} style={chip(budget===item[0])} onClick={function() { setBudget(item[0]); }}>{item[1]}</span>;
                  })}
                </div>
              </div>
            </section>

            <div style={{ textAlign:"center", marginBottom:"22px" }}>
              <button onClick={generate} disabled={loading} style={{ background:COLORS.accent, color:"#0a130a", border:"none", borderRadius:"10px", fontFamily:font, fontWeight:"700", fontSize:"15px", padding:"12px 42px", cursor:"pointer" }}>
                {loading ? "Generating..." : "Generate Grocery List"}
              </button>
            </div>

            {planError && <div style={{ background:"rgba(224,82,82,0.1)", border:"1px solid " + COLORS.danger, borderRadius:"9px", padding:"13px 16px", color:COLORS.danger, fontFamily:mono, fontSize:"11px" }}>{planError}</div>}

            {loading && (
              <div style={{ textAlign:"center", padding:"32px 20px", color:COLORS.textMuted, fontFamily:mono, fontSize:"12px" }}>
                <div style={{ fontSize:"26px", marginBottom:"12px" }}>🌿</div>
                <span>Analyzing meals...</span>
              </div>
            )}

            {result && !loading && (
              <section style={{ background:COLORS.card, border:"1px solid " + COLORS.border, borderRadius:"12px", padding:"20px" }} ref={resultRef}>
                <p style={{ margin:"0 0 14px", fontSize:"11px", fontFamily:mono, color:COLORS.textMuted, textTransform:"uppercase" }}>Your Grocery List</p>
                <GroceryResult result={result} onCopy={copyPlanList} copied={copied} />
              </section>
            )}

            {!result && !loading && !planError && (
              <div style={{ textAlign:"center", padding:"44px 20px", color:COLORS.textDim }}>
                <div style={{ fontSize:"44px", marginBottom:"10px" }}>🥗</div>
                <p style={{ fontFamily:mono, fontSize:"11px" }}>Add meals above, then generate your smart shopping list.</p>
              </div>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 195px)", minHeight:"480px" }}>
            <div style={{ display:"flex", gap:"7px", flexWrap:"wrap", marginBottom:"12px" }}>
              {SUGGESTIONS.map(function(s) {
                return (
                  <span key={s} onClick={function() { sendChat(s); }} style={{ background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"20px", color:COLORS.textMuted, fontFamily:mono, fontSize:"10px", padding:"5px 13px", cursor:"pointer" }}>
                    {s}
                  </span>
                );
              })}
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"18px", display:"flex", flexDirection:"column", gap:"13px", background:COLORS.card, borderRadius:"12px 12px 0 0", border:"1px solid " + COLORS.border, borderBottom:"none" }}>
              {history.map(function(msg, idx) {
                return (
                  <div key={idx} style={{ alignSelf: msg.role==="user" ? "flex-end" : "flex-start", maxWidth:"83%" }}>
                    <div style={{ fontFamily:mono, fontSize:"9px", textTransform:"uppercase", marginBottom:"4px", color: msg.role==="user" ? COLORS.accent : COLORS.textMuted }}>
                      {msg.role==="user" ? "You" : "Grocery AI"}
                    </div>
                    <div style={{ background: msg.role==="user" ? COLORS.accentGlow : COLORS.surface, border:"1px solid " + (msg.role==="user" ? COLORS.accentDim : COLORS.border), borderRadius: msg.role==="user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding:"11px 15px", fontSize:"14px", lineHeight:"1.7", color:COLORS.text }}>
                      <div style={{ whiteSpace:"pre-wrap" }}>{msg.content}</div>
                      {msg.grocery && (
                        <div style={{ marginTop:"13px", borderTop:"1px solid " + COLORS.border, paddingTop:"13px" }}>
                          <GroceryResult result={msg.grocery} onCopy={function() { copyChatList(msg.grocery, idx); }} copied={chatCopied===idx} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {chatBusy && (
                <div style={{ alignSelf:"flex-start" }}>
                  <div style={{ fontFamily:mono, fontSize:"9px", textTransform:"uppercase", marginBottom:"4px", color:COLORS.textMuted }}>Grocery AI</div>
                  <div style={{ background:COLORS.surface, border:"1px solid " + COLORS.border, borderRadius:"16px 16px 16px 4px", padding:"14px 18px", display:"inline-flex", gap:"5px" }}>
                    {[0,1,2].map(function(i) {
                      return <span key={i} style={{ display:"inline-block", width:"7px", height:"7px", borderRadius:"50%", background:COLORS.accentDim, animation:"pulse 1s ease-in-out infinite", animationDelay:(i*0.2)+"s" }} />;
                    })}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={{ display:"flex", gap:"9px", padding:"12px 14px", background:COLORS.surface, border:"1px solid " + COLORS.border, borderTop:"none", borderRadius:"0 0 12px 12px" }}>
              <textarea value={chatInput} onChange={function(e) { setChatInput(e.target.value); }}
                onKeyDown={function(e) { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Ask about meals, recipes, grocery lists... (Enter to send)"
                rows={1}
                style={{ flex:1, background:COLORS.bg, border:"1px solid " + COLORS.border, borderRadius:"8px", color:COLORS.text, fontFamily:font, fontSize:"13px", padding:"10px 13px", resize:"none", minHeight:"40px", maxHeight:"110px" }}
              />
              <button onClick={function() { sendChat(); }} disabled={chatBusy || !chatInput.trim()}
                style={{ background:COLORS.accent, color:"#0a130a", border:"none", borderRadius:"8px", fontFamily:font, fontWeight:"700", fontSize:"13px", padding:"10px 18px", cursor:"pointer", alignSelf:"flex-end", opacity: (chatBusy || !chatInput.trim()) ? 0.5 : 1 }}>
                Send
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
