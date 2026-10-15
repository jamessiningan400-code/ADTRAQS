/// <reference types="vite/client" />

import { Fragment, useState, useContext, createContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import sealImg from "../imports/image-3.png";
import loginBackdropImg from "../imports/login-background.jpg";
import { QRCodeSVG } from "qrcode.react";
import { Bell, ChevronDown, Eye, EyeOff, QrCode, RefreshCw } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────

type Theme = "dark" | "light";

const DARK_C = {
  purple:"#6C4FF5", blue:"#3B82F6", red:"#EF4444", green:"#10B981",
  bg:"#0B0E1A", card:"#141827", card2:"#1A1F35", sidebar:"#0D1021",
  border:"rgba(255,255,255,0.07)", text:"#E8EAF2", muted:"#6B7494", sub:"#A0A8C0",
};
const LIGHT_C = {
  purple:"#6C4FF5", blue:"#2563EB", red:"#DC2626", green:"#16A34A",
  bg:"#F5F6FA", card:"#FFFFFF", card2:"#F0F1F5", sidebar:"#FFFFFF",
  border:"rgba(0,0,0,0.08)", text:"#1A1D2B", muted:"#111827", sub:"#111827",
};

const ThemeCtx = createContext<{ theme:Theme; setTheme:(t:Theme)=>void }>({
  theme:"light", setTheme:()=>{},
});

const API_BASE = (typeof import.meta !== "undefined" ? import.meta.env.VITE_API_URL : "") || "";

const buildApiUrl = (path:string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
};

const apiFetch = (path:string, init?: RequestInit) => fetch(buildApiUrl(path), init);

if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api") && API_BASE) {
      return originalFetch(buildApiUrl(input), init);
    }

    if (input instanceof URL && input.pathname.startsWith("/api") && API_BASE) {
      const nextUrl = new URL(input.toString());
      const apiBase = new URL(API_BASE, window.location.origin);
      const apiBasePath = `${apiBase.pathname.replace(/\/+$/, "")}/`;
      const requestPath = nextUrl.pathname.replace(/^\/+/, "");
      return originalFetch(
        new URL(`${requestPath}${nextUrl.search}${nextUrl.hash}`, `${apiBase.origin}${apiBasePath}`),
        init,
      );
    }

    return originalFetch(input, init);
  };
}

function useC() {
  const { theme } = useContext(ThemeCtx);
  return theme === "dark" ? DARK_C : LIGHT_C;
}

function useTheme() {
  return useContext(ThemeCtx);
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Role    = "staff" | "admin";
interface AuthUser { id:number; fullName:string; email:string; username?:string; role:Role; office:string; status:string; position?:string; contactNumber?:string; }
type AppMode = "main" | "office-ct" | "office-cb" | "office-ca" | "processor";
type AppScreen =
  | "login" | "signup" | "dashboard" | "document-tracker"
  | "tracking-monitoring"
  | "reports" | "user-management" | "settings" | "profile";
type DocStatus = "For Signature" | "Completed";
type CatalogKey = "offices"|"funds"|"types"|"signatures";
type CatalogData = Record<CatalogKey,string[]>;

const APP_SESSION_STORAGE_KEY = "adtraqs-app-session";

interface SavedAppSession {
  user:AuthUser;
  role:Role;
  screen:AppScreen;
  theme:Theme;
}

function isSavedAppSession(value:unknown):value is SavedAppSession {
  if (!value||typeof value!=="object") return false;
  const session=value as Record<string,unknown>;
  const user=session.user;
  if (!user||typeof user!=="object") return false;
  const savedUser=user as Record<string,unknown>;
  const validScreen=["dashboard","document-tracker","tracking-monitoring",
    "reports","user-management","settings","profile"].some(screen=>screen===session.screen);
  return typeof savedUser.id==="number"&&
    typeof savedUser.fullName==="string"&&
    typeof savedUser.email==="string"&&
    (savedUser.role==="admin"||savedUser.role==="staff")&&
    typeof savedUser.office==="string"&&
    typeof savedUser.status==="string"&&
    session.role===savedUser.role&&
    validScreen&&
    (session.theme==="dark"||session.theme==="light");
}

function readSavedAppSession():SavedAppSession|null {
  if (typeof window==="undefined") return null;
  try {
    const saved=window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (!saved) return null;
    const parsed:unknown=JSON.parse(saved);
    if (parsed&&typeof parsed==="object"&&
        (parsed as Record<string,unknown>).screen==="signature-monitoring") {
      (parsed as Record<string,unknown>).screen="dashboard";
    }
    if (isSavedAppSession(parsed)) return parsed;
    window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
    console.error("Saved app session was invalid and has been cleared.");
  } catch (error) {
    console.error("Failed to restore the saved app session.",error);
    try {
      window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch (clearError) {
      console.error("Failed to clear the invalid saved app session.",clearError);
    }
  }
  return null;
}

function saveAppSession(session:SavedAppSession) {
  try {
    window.sessionStorage.setItem(APP_SESSION_STORAGE_KEY,JSON.stringify(session));
    return true;
  } catch (error) {
    console.error("Failed to save the app session before reload.",error);
    return false;
  }
}

function clearSavedAppSession() {
  try {
    window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear the saved app session.",error);
  }
}

function normalizeSignature(value:string) {
  return value.trim().replace(/\s*[–—-]\s*/g," – ").replace(/\s+/g," ").toLocaleLowerCase();
}

function getCatalogSignature(value:string, signatures:string[]) {
  const normalized=normalizeSignature(value);
  const exact=signatures.find(signature=>normalizeSignature(signature)===normalized);
  if(exact) return exact;
  const code=normalized.split(" – ")[0].trim();
  const matches=signatures.filter(signature=>normalizeSignature(signature).split(" – ")[0].trim()===code);
  return matches.length===1?matches[0]:undefined;
}

interface DocRecord {
  id: string; date: string; type: string; office: string;
  payrollVoucher: string; particulars: string; fund: string;
  amount: number; signature: string; dateForwarded?: string; createdAt?: string;
  status: DocStatus; chequeNo?: string; dateReturned?: string;
  prNumber?: string; subType?: string; qrGenerated?: boolean;
  processorName?:string; processorContactNumber?:string;
  flagData?: { reason: string; flaggedBy?: string; flaggedAt?: string };
  previousStatus?: DocStatus;
}

function hasCompleteDocumentDetails(doc:DocRecord, includeReturnDetails=false) {
  const requiredDetails=[doc.type,doc.office,doc.payrollVoucher,doc.particulars,doc.fund,doc.signature];
  if (includeReturnDetails) requiredDetails.push(doc.chequeNo??"",doc.prNumber??"");
  return requiredDetails.every(value=>value.trim().length>0)&&Number.isFinite(doc.amount)&&doc.amount>=0;
}

function hasCompleteDocumentEntry(doc:DocRecord) {
  const requiredFields=[
    doc.id,doc.date,doc.type,doc.office,doc.payrollVoucher,doc.particulars,
    doc.fund,doc.signature,doc.chequeNo??"",doc.subType??"",doc.prNumber??"",
  ];
  return requiredFields.every(value=>value.trim().length>0)&&Number.isFinite(doc.amount)&&doc.amount>=0;
}

type JourneyStepKey = "cto" | "cbo" | "cao";

interface OfficeStepData {
  received?: string; forSig?: string; forwarded?: string;
  forwardedTo?: string; forwardedBy?: string; receivedBy?: string;
}

interface OfficeVisit extends OfficeStepData { office:string; }

interface TrackingRecord {
  id: string; controlNo: string; particulars: string; type: string;
  initiatedAt: string;
  cto?: OfficeStepData; cbo?: OfficeStepData; cao?: OfficeStepData;
  caReturn?: { received?: string; receivedBy?: string };
  visits?: OfficeVisit[];
  completedAt?: string; completedBy?: string;
}

interface GroupTrackingRecord extends TrackingRecord {
  groupId: number;
  startControlNo: string;
  endControlNo: string;
  documents: DocRecord[];
}

interface TrackingNotification {
  id:string; title:string; detail:string; controlNo:string; tone:"warning"|"info";
}

interface OfficeStaffRow {
  id:number; fullName:string; contactNumber:string; office:string; status:string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const JOURNEY_NODES = [
  { code:"CA",  full:"City Admin's Office"      },
  { code:"CTO", full:"City Treasurer's Office"  },
  { code:"CBO", full:"City Budget Office"       },
  { code:"CAO", full:"City Accountant's Office" },
  { code:"✓",   full:"Complete"                 },
];

const STEP_KEY: Record<string, JourneyStepKey> = { CTO:"cto", CBO:"cbo", CAO:"cao" };
const NEXT_STEP: Record<string, string> = { CTO:"CBO", CBO:"CAO", CAO:"CA" };
const NEXT_FULL: Record<string, string> = {
  CTO:"City Budget Office", CBO:"City Accountant's Office", CAO:"City Administrator's Office",
};
const OFFICE_DISPLAY_NAME:Record<string,string>={
  CA:"City Administrative Office",
  CTO:"City Treasurer's Office",
  CBO:"City Budget Office",
  CAO:"City Accounting Office",
  PRC:"Processors",
};
const MODE_TO_STEP: Record<AppMode, string|null> = {
  "main":null, "processor":null, "office-ct":"CTO", "office-cb":"CBO", "office-ca":"CAO",
};
const MODE_OFFICE_NAME: Record<AppMode, string> = {
  "main":"","processor":"",
  "office-ct":"City Treasurer Office",
  "office-cb":"City Budget Office",
  "office-ca":"City Accounting Office",
};
const OFFICE_PORTAL_MODES: AppMode[] = ["office-ct","office-cb","office-ca","processor"];

function getOfficePortalMode(): AppMode|null {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  return OFFICE_PORTAL_MODES.find(mode => mode === requestedMode) ?? null;
}

const STATUS_CFG: Record<DocStatus,{color:string;bg:string}> = {
  "For Signature":{ color:"#3B82F6", bg:"rgba(59,130,246,0.15)" },
  "Completed":    { color:"#6C4FF5", bg:"rgba(108,79,245,0.15)" },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const SYSTEM_TIME_ZONE = "Asia/Manila";

function getSystemDateParts(date:Date) {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:SYSTEM_TIME_ZONE,
    year:"numeric", month:"2-digit", day:"2-digit",
    weekday:"long", hour:"2-digit", minute:"2-digit", hourCycle:"h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part=>[part.type,part.value])) as Record<string,string>;
}

function systemDateKey(date:Date) {
  const parts=getSystemDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseSystemTimestamp(value:string) {
  const normalized=value.includes("T")?value:value.replace(" ","T");
  const withZone=/([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)
    ?normalized
    :`${normalized}+08:00`;
  return new Date(withZone);
}

function fmtDate(s:string) {
  const match=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return s;
  const [,year,month,day]=match;
  const weekday=new Date(Date.UTC(Number(year),Number(month)-1,Number(day))).getUTCDay();
  return `${DAYS[weekday].toUpperCase()} ${Number(day)} ${MONTHS[Number(month)-1]} ${year}`;
}
function fmtLocalDateTime(value?:string) {
  if (!value) return "—";
  const d=parseSystemTimestamp(value);
  if (isNaN(d.getTime())) return value;
  const parts=getSystemDateParts(d), hour=Number(parts.hour);
  return `${parts.weekday.toUpperCase()} ${Number(parts.day)} ${MONTHS[Number(parts.month)-1]} ${parts.year} ${hour%12||12}:${parts.minute} ${hour>=12?"PM":"AM"}`;
}
function fmtDateTimeDisplay(d:Date) {
  const parts=getSystemDateParts(d), hour=Number(parts.hour);
  return `${parts.weekday.toUpperCase()} ${Number(parts.day)} ${MONTHS[Number(parts.month)-1]} ${parts.year}, ${hour%12||12}:${parts.minute} ${hour>=12?"PM":"AM"}`;
}
function fmtStepDate(ts:string) {
  if (!ts) return "—";
  const d=parseSystemTimestamp(ts);
  if (isNaN(d.getTime())) return ts;
  const parts=getSystemDateParts(d), hour=Number(parts.hour);
  return `${parts.month}/${parts.day}/${parts.year.slice(-2)} ${hour%12||12}:${parts.minute}${hour>=12?"PM":"AM"}`;
}
function parseControlNumberFromQr(rawValue:string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(/(?:ADTRAQS|SMART[-_\s]*DOCS|CTL|CONTROL)[:\-_/\s]*?(\d{7})/i);
  if (explicit) return explicit[1];

  const compact = trimmed.match(/(\d{7})/);
  if (compact) return compact[1];

  const digitsOnly = trimmed.replace(/\D+/g, "");
  if (digitsOnly.length >= 7) return digitsOnly.slice(-7);

  return null;
}
function getProcessorDocumentUrl(controlNo:string):string {
  const url=new URL("office.html",window.location.href);
  url.searchParams.set("mode","processor");
  url.searchParams.set("control",controlNo);
  return url.toString();
}
function parseGroupRangeFromQr(rawValue:string): string | null {
  const trimmed=rawValue.trim().replace(/^#/,"");
  const queryIndex=trimmed.indexOf("?");
  if (queryIndex>=0) {
    const controlParameter=new URLSearchParams(trimmed.slice(queryIndex+1)).get("control")?.trim().replace(/^#/,"");
    if (controlParameter&&/^\d{7}(?:-\d{7})?$/.test(controlParameter)) return controlParameter;
  }
  if (/^\d{7}(?:-\d{7})?$/.test(trimmed)) return trimmed;
  const match=trimmed.match(/(?:(?:ADTRAQS|SMART[-_\s]*DOCS)[:\-_/\s]*)?GROUP[:\-_/\s]*(\d{7}(?:-\d{7})?)/i);
  return match?.[1]??null;
}
function nowTs() {
  const d=new Date();
  const parts=getSystemDateParts(d);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function getTrackingActor(user:AuthUser|null|undefined) {
  const fullName=user?.fullName.trim();
  const contactNumber=user?.contactNumber?.replace(/\D/g,"");
  return fullName&&contactNumber?.length===11?`${fullName} / ${contactNumber}`:"";
}

async function syncTrackingAction(payload:{controlNo:string;office:string;action:"receive"|"forSig"|"forward"|"complete"|"dispatch";forwardedTo?:string;actor?:string}) {
  const response=await apiFetch('/api/tracking-update', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
  });
  const result=await response.json().catch(()=>null);
  if (!response.ok||!result?.success) {
    throw new Error(result?.message??`Tracking update failed (${response.status})`);
  }
  return result;
}

async function loadCatalog():Promise<CatalogData> {
  const keys:CatalogKey[]=["offices","funds","types","signatures"];
  const responses=await Promise.all(keys.map(key=>
    fetch(`/api/catalog.php?type=${key}`,{cache:'no-store'})
  ));
  const data=await Promise.all(responses.map(async(response)=>{
    if (!response.ok) throw new Error(`Unable to load catalog data (${response.status}).`);
    const result=await response.json();
    if (!result.success) throw new Error(result.message||"Unable to load catalog data.");
    return result;
  }));
  const readNames=(items:unknown):string[]=>Array.isArray(items)
    ?Array.from(new Set((items as {name?:unknown}[]).flatMap(item=>typeof item.name==='string'&&item.name.trim()?[item.name.trim()]:[])))
    :[];
  return {
    offices:readNames(data[0].items),
    funds:readNames(data[1].items),
    types:readNames(data[2].items),
    signatures:readNames(data[3].items),
  };
}

function getStepperStatus(r:TrackingRecord) {
  if (r.visits) {
    const latest=(office:string)=>r.visits?.filter(visit=>visit.office===office).at(-1);
    const ca=latest("CA"), cto=latest("CTO"), cbo=latest("CBO"), cao=latest("CAO");
    return {
      completed:[true, !!cto, !!cbo, !!cao, !!ca?.received],
      timestamps:[r.initiatedAt, cto?.received??cto?.forwarded, cbo?.received??cbo?.forwarded,
        cao?.received??cao?.forwarded, ca?.received],
    };
  }
  return {
    completed:[true, !!r.cto?.forwarded, !!r.cbo?.forwarded, !!r.cao?.forwarded, !!r.caReturn?.received],
    timestamps:[r.initiatedAt, r.cto?.forwarded, r.cbo?.forwarded, r.cao?.forwarded, r.caReturn?.received],
  };
}

function getCurrentPosition(r:TrackingRecord):{office:string;stage:string} {
  if (r.completedAt) return { office:"Complete", stage:"Complete" };
  const visit=r.visits?.[r.visits.length-1];
  if (visit) {
    if (visit.forwarded) return { office:visit.forwardedTo??visit.office, stage:"Awaiting Receipt" };
    if (visit.forSig) return { office:visit.office, stage:"For Signature" };
    if (visit.received) return { office:visit.office, stage:"Received" };
    return { office:visit.office, stage:"Awaiting Receipt" };
  }
  if (r.caReturn?.received) return { office:"Complete",  stage:"Complete"         };
  if (r.cao?.forwarded)     return { office:"CA",        stage:"Awaiting Receipt" };
  if (r.cao?.forSig)        return { office:"CAO",       stage:"For Signature"    };
  if (r.cao?.received)      return { office:"CAO",       stage:"Received"         };
  if (r.cbo?.forwarded)     return { office:"CAO",       stage:"Awaiting Receipt" };
  if (r.cbo?.forSig)        return { office:"CBO",       stage:"For Signature"    };
  if (r.cbo?.received)      return { office:"CBO",       stage:"Received"         };
  if (r.cto?.forwarded)     return { office:"CBO",       stage:"Awaiting Receipt" };
  if (r.cto?.forSig)        return { office:"CTO",       stage:"For Signature"    };
  if (r.cto?.received)      return { office:"CTO",       stage:"Received"         };
  return                           { office:"CTO",       stage:"Awaiting Receipt" };
}

function getLatestTrackingActivityTime(record:TrackingRecord) {
  const timestamps=[
    record.initiatedAt,record.completedAt,record.caReturn?.received,
    ...(record.visits??[]).flatMap(visit=>[visit.received,visit.forSig,visit.forwarded]),
    ...[record.cto,record.cbo,record.cao].flatMap(step=>[step?.received,step?.forSig,step?.forwarded]),
  ].filter((timestamp):timestamp is string=>!!timestamp);
  return timestamps.reduce((latest,timestamp)=>{
    const time=parseSystemTimestamp(timestamp).getTime();
    return Number.isFinite(time)?Math.max(latest,time):latest;
  },0);
}

function getActiveTrackingOffice(r:TrackingRecord):string|null {
  if (r.visits?.length) return getCurrentPosition(r).office;
  if (r.caReturn?.received) return "Complete";
  if (r.cao?.forwarded) return r.cao.forwardedTo??"CA";
  if (r.cao?.received||r.cao?.forSig) return "CAO";
  if (r.cbo?.forwarded) return r.cbo.forwardedTo??"CAO";
  if (r.cbo?.received||r.cbo?.forSig) return "CBO";
  if (r.cto?.forwarded) return r.cto.forwardedTo??"CBO";
  if (r.cto?.received||r.cto?.forSig) return "CTO";
  return null;
}

function isAwaitingReceiptAtOffice(record:TrackingRecord, office:string):boolean {
  const position=getCurrentPosition(record);
  if (position.office!==office||position.stage!=="Awaiting Receipt"||getActiveTrackingOffice(record)!==office) return false;

  const latestVisit=record.visits?.[record.visits.length-1];
  if (latestVisit) {
    return !!latestVisit.forwarded&&(latestVisit.forwardedTo??NEXT_STEP[latestVisit.office])===office;
  }

  return ([
    ["CTO",record.cto,NEXT_STEP.CTO],
    ["CBO",record.cbo,NEXT_STEP.CBO],
    ["CAO",record.cao,NEXT_STEP.CAO],
  ] as const).some(([,step,nextOffice])=>
    !!step?.forwarded&&(step.forwardedTo??nextOffice)===office,
  );
}

type OfficeInboxStage="Awaiting Receipt"|"For Signature"|"Ready to Forward";
function getOfficeInboxStage(record:TrackingRecord, office:string):OfficeInboxStage|null {
  const position=getCurrentPosition(record);
  const lastVisit=record.visits?.at(-1);
  if (["CTO","CBO","CAO"].includes(office)&&lastVisit?.forwardedTo==="PRC"&&
      !!lastVisit.forwarded&&position.stage==="Awaiting Receipt") {
    return "Awaiting Receipt";
  }
  if (position.office!==office||getActiveTrackingOffice(record)!==office) return null;
  if (position.stage==="Awaiting Receipt") {
    return isAwaitingReceiptAtOffice(record,office)?"Awaiting Receipt":null;
  }
  if (position.stage==="Received") return "For Signature";
  if (position.stage==="For Signature") return "Ready to Forward";
  return null;
}

function getForwardingOfficeCode(record:TrackingRecord, destination:string):string {
  const visits=record.visits??[];
  const latestVisit=[...visits].reverse().find(visit=>
    !!visit.forwarded&&(visit.forwardedTo??NEXT_STEP[visit.office])===destination,
  );
  const processorHandoff=[...visits].reverse().find(visit=>
    !!visit.forwarded&&visit.forwardedTo==="PRC",
  );
  if (processorHandoff&&destination!=="CA") {
    const processorHandoffIndex=visits.lastIndexOf(processorHandoff);
    if (getCurrentPosition(record).office==="PRC") return "PRC";
    if (latestVisit&&visits.indexOf(latestVisit)>processorHandoffIndex) return latestVisit.office;
    const receiptAtDestination=visits.slice(processorHandoffIndex+1).some(visit=>
      visit.office===destination&&!!visit.received,
    );
    if (receiptAtDestination) return "PRC";
  }
  if (latestVisit) return latestVisit.office;

  const legacySteps=[
    ["CTO",record.cto,NEXT_STEP.CTO],
    ["CBO",record.cbo,NEXT_STEP.CBO],
    ["CAO",record.cao,NEXT_STEP.CAO],
  ] as const;
  const forwardingStep=[...legacySteps].reverse().find(([,step,nextOffice])=>
    !!step?.forwarded&&(step.forwardedTo??nextOffice)===destination,
  );
  return forwardingStep?.[0]??"CA";
}

function getForwardingOfficeName(record:TrackingRecord, destination:string):string {
  const officeCode=getForwardingOfficeCode(record,destination);
  return OFFICE_DISPLAY_NAME[officeCode]??officeCode;
}

function getTrackingNotifications(records:TrackingRecord[]):TrackingNotification[] {
  return records.flatMap(record=>{
    const pos=getCurrentPosition(record);
    const notifications:TrackingNotification[]=[];
    if (pos.stage==="Awaiting Receipt") notifications.push({
      id:`receipt-${record.id}`, title:"Receipt pending", detail:`#${record.controlNo} at ${pos.office}`,
      controlNo:record.controlNo, tone:"info",
    });
    return notifications;
  });
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function StatusBadge({ status }:{ status:DocStatus }) {
  const s=STATUS_CFG[status];
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
    style={{ color:s.color, backgroundColor:s.bg }}>{status}</span>;
}

function GingoogSeal({ size=56 }:{ size?:number }) {
  return <img src={sealImg} alt="Gingoog City Official Seal" width={size} height={size}
    style={{ borderRadius:"50%", objectFit:"cover", flexShrink:0,
      boxShadow:"0 0 0 2px rgba(255,255,255,0.15),0 4px 16px rgba(0,0,0,0.4)" }}/>;
}

function Card({ children, className="", style }: { children:React.ReactNode; className?:string; style?:React.CSSProperties }) {
  const C=useC();
  return <div className={`rounded-xl border ${className}`}
    style={{ background:C.card, borderColor:C.border, ...style }}>{children}</div>;
}

function Btn({ children, variant="primary", onClick, disabled, className="", type="button", size="default" }:{
  children:React.ReactNode; variant?:"primary"|"ghost"|"danger"|"success";
  onClick?:()=>void; disabled?:boolean; className?:string; type?:"button"|"submit"; size?:"default"|"large";
}) {
  const C=useC();
  const s={
    primary:{ background:C.purple, color:"#fff", border:"none" },
    ghost:{ background:C.card2, color:C.sub, border:`1px solid ${C.border}` },
    danger:{ background:"rgba(239,68,68,0.12)", color:C.red, border:"1px solid rgba(239,68,68,0.3)" },
    success:{ background:"rgba(16,185,129,0.12)", color:C.green, border:"1px solid rgba(16,185,129,0.3)" },
  };
  return <button type={type} onClick={onClick} disabled={disabled}
    className={`${size==="large"?"px-5 py-2.5 text-sm":"px-4 py-2 text-xs"} rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    style={s[variant]}>{children}</button>;
}

function Field({ label, children, size="default" }:{ label:string; children:React.ReactNode; size?:"default"|"large" }) {
  const C=useC();
  return <div>
    <label className={`block ${size==="large"?"text-sm":"text-xs"} font-medium mb-1.5`} style={{ color:C.sub }}>{label}</label>
    {children}
  </div>;
}

function TInput({ placeholder="", type="text", value, onChange, readOnly=false, size="default" }:{
  placeholder?:string; type?:string; value?:string; onChange?:(v:string)=>void; readOnly?:boolean; size?:"default"|"large";
}) {
  const C=useC();
  return <input type={type} placeholder={placeholder} value={value} readOnly={readOnly}
    onChange={e=>onChange?.(e.target.value)}
    className={`w-full rounded-xl px-3.5 ${size==="large"?"py-3 text-sm":"py-2.5 text-xs"} border outline-none`}
    style={{ background:readOnly?C.card:C.card2, borderColor:C.border,
      color:readOnly?C.muted:C.text, cursor:readOnly?"default":"text" }}/>;
}

function TSelect({ options, value, onChange, placeholder="Select...", size="default", optionLabels }:{
  options:string[]; value?:string; onChange?:(v:string)=>void; placeholder?:string; size?:"default"|"large";
  optionLabels?:Record<string,string>;
}) {
  const C=useC();
  return <select value={value} onChange={e=>onChange?.(e.target.value)}
    className={`w-full rounded-xl px-3.5 ${size==="large"?"py-3 text-sm":"py-2.5 text-xs"} border outline-none`}
    style={{ background:C.card2, borderColor:C.border, color:C.text }}>
    <option value="">{placeholder}</option>
    {options.map(o=><option key={o} value={o}>{optionLabels?.[o]??o}</option>)}
  </select>;
}

function ChartTip({ active, payload }:any) {
  const C=useC();
  if (!active||!payload?.length) return null;
  return <div className="rounded-lg px-3 py-1.5 text-xs"
    style={{ background:C.card2, border:`1px solid ${C.border}`, color:C.text }}>
    {payload[0].name??payload[0].dataKey}: <strong>{payload[0].value}</strong>
  </div>;
}

function Pagination({ total, shown }:{ total:number; shown:number }) {
  const C=useC();
  return <div className="px-4 py-2 flex items-center justify-between"
    style={{ borderTop:`1px solid ${C.border}` }}>
    <span className="text-xs" style={{ color:C.muted }}>Showing 1 to {shown} of {total} entries</span>
    <div className="flex gap-1">
      {["‹","1","›"].map((p,i)=>(
        <button key={`pg-${i}`} className="w-6 h-6 rounded text-xs flex items-center justify-center"
          style={{ background:i===1?C.purple:C.card2, color:i===1?"#fff":C.muted }}>{p}</button>
      ))}
    </div>
  </div>;
}

function ModalOverlay({ onClose, children, wide=false }:{
  onClose:()=>void; children:React.ReactNode; wide?:boolean;
}) {
  const C=useC();
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center overflow-y-auto p-4"
      style={{ background:"transparent" }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`rounded-2xl w-full ${wide?"max-w-[1100px]":"max-w-[920px]"} max-h-[90vh] overflow-y-auto`}
        style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 24px 60px rgba(0,0,0,0.2)" }}>
        <div className="flex justify-end px-5 pt-4">
          <button onClick={onClose} className="text-xl leading-none hover:opacity-70"
            style={{ color:C.muted }}>×</button>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function QrPrintModal({ doc, onClose }:{ doc:DocRecord; onClose:()=>void }) {
  const C=useC();
  const qrId=`forward-qr-${doc.id}`;
  const qrValue=getProcessorDocumentUrl(doc.id);

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background:"transparent" }} onClick={event=>event.target===event.currentTarget&&onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`QR label for document ${doc.id}`}
        className="w-full max-w-sm rounded-xl border p-5"
        style={{ background:C.card, borderColor:C.border, boxShadow:"0 24px 60px rgba(0,0,0,0.2)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold" style={{ color:C.text }}>Document QR Label</h3>
            <p className="text-xs mt-1" style={{ color:C.muted }}>Control No. #{doc.id}</p>
          </div>
        </div>
        <div className="flex justify-center rounded-lg p-4" style={{ background:"#fff" }}>
          <QRCodeSVG id={qrId} value={qrValue} size={220} bgColor="#ffffff" fgColor="#0D1021" level="M"/>
        </div>
        {doc.processorName&&(
          <div className="mt-3 rounded-lg border p-4 text-center" style={{ borderColor:C.border, background:C.card2 }}>
            <p className="text-base font-semibold" style={{ color:C.text }}>Processor</p>
            <p className="mt-1 text-lg font-medium" style={{ color:C.sub }}>{doc.processorName}</p>
            {doc.processorContactNumber&&(
              <p className="mt-1 text-lg font-medium" style={{ color:C.sub }}>{doc.processorContactNumber}</p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function GroupQrModal({ group, onClose }:{ group:GroupTrackingRecord; onClose:()=>void }) {
  const C=useC();
  const qrId=`group-qr-${group.groupId}`;
  const qrValue=getProcessorDocumentUrl(group.controlNo);
  const currentForwardedOffice=(group.visits??[])
    .filter(visit=>!!visit.forwarded&&["CTO","CBO","CAO"].includes(visit.forwardedTo??""))
    .at(-1)?.forwardedTo;

  return (
    createPortal(
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
        style={{ background:"transparent" }} onClick={event=>event.target===event.currentTarget&&onClose()}>
        <div role="dialog" aria-modal="true" aria-label={`SET QR label for document set ${group.controlNo}`}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border p-5"
          style={{ background:C.card, borderColor:C.border, boxShadow:"0 24px 60px rgba(0,0,0,0.2)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold" style={{ color:C.text }}>SET QR Label</h3>
              <p className="text-xs mt-1" style={{ color:C.muted }}>One QR · Control No. #{group.controlNo}</p>
            </div>
          </div>
          <div className="flex justify-center rounded-lg p-4" style={{ background:"#fff" }}>
            <QRCodeSVG id={qrId} value={qrValue} size={220} bgColor="#ffffff" fgColor="#0D1021" level="M"/>
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full min-w-[420px] text-left">
              <thead><tr style={{ background:C.sidebar }}>
                {["Control No.","Particulars / Details","Type","P.R. No."].map(label=>
                  <th key={label} className="px-3 py-2 text-xs font-semibold" style={{ color:C.text }}>{label}</th>
                )}
              </tr></thead>
              <tbody>{group.documents.map(doc=>(
                <tr key={doc.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td className="px-3 py-2 text-xs font-semibold" style={{ color:C.purple }}>#{doc.id}</td>
                  <td className="px-3 py-2 text-xs" style={{ color:C.sub }}>{doc.particulars}</td>
                  <td className="px-3 py-2 text-xs" style={{ color:C.sub }}>{doc.type}</td>
                  <td className="px-3 py-2 text-xs" style={{ color:C.sub }}>{doc.prNumber??"—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5">
            <p className="text-base font-bold break-words" style={{ color:C.purple }}>
              Forwarded to: {currentForwardedOffice??"No offices yet"}
            </p>
          </div>
        </div>
      </div>,
      document.body
    )
  );
}

// ── Auth components ──────────────────────────────────────────────────────────

function AuthBg({ children, backgroundImage }:{ children:React.ReactNode; backgroundImage?:string }) {
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const C=useC();
  return <div className="min-h-screen flex items-center justify-center relative overflow-hidden page-enter"
      style={backgroundImage?{
        backgroundImage:`linear-gradient(120deg,rgba(5,10,35,0.66),rgba(35,48,130,0.62)),url("${backgroundImage}")`,
        backgroundSize:"cover",
        backgroundPosition:"center",
      }:{ background:isDark
        ?`linear-gradient(160deg,${C.bg} 0%,${C.card} 40%,${C.card2} 70%,${C.sidebar} 100%)`
        :`linear-gradient(160deg,#F0F2FF 0%,#F5F6FA 40%,#EEF0FF 70%,#F5F6FA 100%)` }}>
    <div className="absolute inset-0 pointer-events-none"
      style={{ background:isDark
        ?"radial-gradient(ellipse 80% 60% at 50% 35%,rgba(40,60,140,0.28) 0%,transparent 70%)"
        :"radial-gradient(ellipse 80% 60% at 50% 35%,rgba(108,79,245,0.08) 0%,transparent 70%)" }}/>
    <div className="relative z-10 w-full flex items-center justify-center px-4 py-8">{children}</div>
  </div>;
}

function AuthInput({ label, type="text", placeholder, value, onChange, onKeyDown }:{
  label?:string; type?:string; placeholder?:string; value?:string;
  onChange?:(v:string)=>void; onKeyDown?:(e:React.KeyboardEvent)=>void;
}) {
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const C=useC();
  return <div>
    {label&&<label className="block text-xs mb-1 font-medium"
      style={{ color:isDark?"rgba(255,255,255,0.55)":"#5C6178" }}>{label}</label>}
    <input type={type} placeholder={placeholder} value={value}
      onChange={e=>onChange?.(e.target.value)} onKeyDown={onKeyDown}
      className="w-full rounded-md px-3 py-2 text-sm outline-none border"
        style={{ background:isDark?C.card2:"#F0F1F5",
          borderColor:isDark?C.border:"rgba(0,0,0,0.1)",
          color:isDark?C.text:"#1A1D2B" }}/>
  </div>;
}

function AuthSelect({ label, placeholder, options }:{ label?:string; placeholder?:string; options:string[] }) {
  const { theme }=useTheme();
  const isDark=theme==="dark";
  return <div>
    {label&&<label className="block text-xs mb-1 font-medium"
      style={{ color:isDark?"rgba(255,255,255,0.55)":"#5C6178" }}>{label}</label>}
    <select className="w-full rounded-md px-3 py-2 text-sm outline-none border"
      style={{ background:isDark?"rgba(255,255,255,0.08)":"#F0F1F5",
        borderColor:isDark?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.1)",
        color:isDark?"rgba(255,255,255,0.6)":"#5C6178" }}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o} value={o} style={{ background:isDark?"#141827":"#fff" }}>{o}</option>)}
    </select>
  </div>;
}

function AuthCard({ children, className="" }:{ children:React.ReactNode; className?:string }) {
  const { theme }=useTheme();
  const isDark=theme==="dark";
  return <div className={`rounded-2xl px-8 py-7 ${className}`}
    style={{ background:isDark?"rgba(10,14,40,0.72)":"rgba(255,255,255,0.96)",
      backdropFilter:"blur(18px)", WebkitBackdropFilter:"blur(18px)",
      border:isDark?"1px solid rgba(255,255,255,0.1)":"1px solid rgba(0,0,0,0.08)",
      boxShadow:isDark?"0 24px 60px rgba(0,0,0,0.5)":"0 24px 60px rgba(108,79,245,0.1)" }}>{children}</div>;
}

// ── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }:{ checked:boolean; onChange:(v:boolean)=>void }) {
  return <button onClick={()=>onChange(!checked)} style={{
    width:44, height:24, borderRadius:12, flexShrink:0, position:"relative",
    background:checked?"#10B981":"#CBD5E1", border:"none", cursor:"pointer",
  }}>
    <div style={{
      position:"absolute", top:3, width:18, height:18, borderRadius:"50%",
      background:"#fff", left:checked?23:3, transition:"left 0.15s",
      boxShadow:"0 1px 4px rgba(0,0,0,0.2)",
    }}/>
  </button>;
}

function ThemeToggleBtn() {
  const { theme, setTheme }=useTheme();
  const C=useC();
  const isDark=theme==="dark";
  return (
    <button onClick={()=>setTheme(isDark?"light":"dark")}
      title={isDark?"Switch to Light Mode":"Switch to Dark Mode"}
      aria-label={isDark?"Switch to Light Mode":"Switch to Dark Mode"}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm border"
      style={{ background:C.card2, borderColor:C.border, color:C.sub, flexShrink:0 }}>
      {isDark?"☀":"🌙"}
    </button>
  );
}

function JourneyStepper({ record, compact=false, labelColor }:{ record:TrackingRecord; compact?:boolean; labelColor?:string }) {
  const C=useC();
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const sz=compact?36:44;
  const officeNames:Record<string,string>={
    CA:"City Admin's Office", CTO:"City Treasurer's Office", CBO:"City Budget Office",
    CAO:"City Accountant's Office", PRC:"Processors",
  };
  const visits=record.visits;
  const route=visits&&visits.length>0
    ?[{ office:"CA", timestamp:record.initiatedAt, done:true },
      ...visits.flatMap((visit,index)=>[
        { office:visit.office, timestamp:visit.received??visit.forSig??visit.forwarded, done:!!visit.received },
        ...(visit.forwardedTo&&visit.forwardedTo!==visit.office&&visits[index+1]?.office!==visit.forwardedTo
          ?[{ office:visit.forwardedTo, timestamp:undefined, done:false }]
          :[]),
      ])]
    :[{ office:"CA", timestamp:record.initiatedAt, done:true },
      ...(["CTO","CBO","CAO"] as const).flatMap(office=>{
        const key=office.toLowerCase() as JourneyStepKey;
        const step=record[key];
        if (!step) return [];
        return [
          { office, timestamp:step.received??step.forSig??step.forwarded, done:!!step.received },
          ...(step.forwardedTo&&step.forwardedTo!==office
            ?[{ office:step.forwardedTo, timestamp:undefined, done:false }]
            :[]),
        ];
      }),
      ...(record.caReturn?.received?[{ office:"CA", timestamp:record.caReturn.received, done:true }]:[])];
  const displayedRoute=route.filter((node,index)=>index===0||node.office!==route[index-1].office);

  return (
    <div style={{ display:"flex", alignItems:"flex-start", width:"100%" }}>
      {displayedRoute.map((node,i)=>{
        const done=node.done;
        const ts=node.timestamp;
        const label=officeNames[node.office]??(node.office==="✓"?"Complete":node.office);
        return (
          <Fragment key={`${node.office}-${i}`}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, width:sz+16 }}>
              <div style={{
                width:sz, height:sz, borderRadius:"50%", display:"flex", alignItems:"center",
                justifyContent:"center", fontWeight:700, fontSize:compact?10:12,
                background:done?"#10B981":isDark?"#FFFFFF":"#F0F1F5",
                color:done?"#fff":isDark?"#1A2035":"#4B5680",
                border:done?"none":`2px solid ${isDark?"#CBD5E1":"#C7CAD6"}`,
                boxShadow:done?"0 2px 8px rgba(16,185,129,0.35)":"none",
              }}>
                {node.office}
              </div>
              <div style={{ fontSize:compact?9:10, color:done?"#10B981":labelColor??C.muted,
                textAlign:"center", marginTop:6, lineHeight:1.3, maxWidth:sz+16 }}>
                {label}
              </div>
              {done&&ts&&(
                <div style={{ fontSize:compact?8:9, color:"#10B981", textAlign:"center", marginTop:2 }}>
                  {fmtStepDate(ts)}
                </div>
              )}
            </div>
            {i<displayedRoute.length-1&&<div style={{ flex:"1 1 0", height:2, marginTop:sz/2-1, background:done?"#10B981":isDark?"#374151":"#CBD5E1" }}/>} 
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── DOCUMENT STATUS CARD ─────────────────────────────────────────────────────

function DocumentStatusCard({ record, doc, stepKey, groupDocuments, showSummary=true, mutedTextColor="#8B93B0" }:{
  record:TrackingRecord; doc?:DocRecord; stepKey?:JourneyStepKey; groupDocuments?:DocRecord[];
  showSummary?:boolean; mutedTextColor?:string;
}) {
  const summaryDocuments=groupDocuments?.length?groupDocuments:[doc];
  const showPrNumber=summaryDocuments.some(member=>Boolean(member?.prNumber?.trim()));
  const detailTextColor=mutedTextColor==="#000"?"#000":"#4B5680";
  const pos=doc?.status==="Completed"
    ? { office:"Complete", stage:"Complete" }
    : getCurrentPosition(record);
  const OFFICE_NAME:Record<string,string>={
    CTO:"City Treasurer's Office", CBO:"City Budget Office",
    CAO:"City Accountant's Office", CA:"City Administrator's Office", PRC:"Processors", Complete:"—",
  };
  const journeyVisits:OfficeVisit[]=record.visits?.length?record.visits:[
    ...(["CTO","CBO","CAO"] as const).flatMap(office=>{
      const officeStep=record[office.toLowerCase() as JourneyStepKey];
      return officeStep?[{office,...officeStep}]:[];
    }),
    ...(record.caReturn?[{office:"CA",...record.caReturn}]:[]),
  ];
  const STAGE_CFG:Record<string,{color:string;bg:string}>={
    "Awaiting Receipt":{ color:"#F59E0B", bg:"rgba(245,158,11,0.1)" },
    "Received":        { color:"#3B82F6", bg:"rgba(59,130,246,0.1)" },
    "For Signature":   { color:"#8B5CF6", bg:"rgba(139,92,246,0.1)" },
    "Forwarded":       { color:"#10B981", bg:"rgba(16,185,129,0.1)" },
    "Complete":        { color:"#10B981", bg:"rgba(16,185,129,0.1)" },
  };
  const sc=STAGE_CFG[pos.stage]??{ color:"#8B93B0", bg:"rgba(139,147,176,0.1)" };
  const journeyOffice=stepKey?({ cto:"CTO", cbo:"CBO", cao:"CAO" } as Record<JourneyStepKey,string>)[stepKey]:pos.office;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {showSummary&&(
      <div style={{ borderRadius:16, overflow:"hidden", background:"#fff", border:"1px solid #E2E8F0" }}>
      <div style={{ padding:"12px 16px", background:"#F7F8FC", borderBottom:"1px solid #E2E8F0",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <p style={{ fontWeight:700, fontSize:13, color:"#1A2035", margin:0 }}>
            {OFFICE_NAME[pos.office]??pos.office}
          </p>
          <p style={{ fontSize:11, color:mutedTextColor, margin:"2px 0 0" }}>Control No.: #{record.controlNo}</p>
          {groupDocuments?.length&&<p style={{ fontSize:10, color:mutedTextColor, margin:"2px 0 0" }}>{groupDocuments.length} documents · shared group tracking</p>}
        </div>
        <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:99,
          background:sc.bg, color:sc.color }}>{pos.stage}</span>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#0D1021", borderBottom:"2px solid rgba(108,79,245,0.4)" }}>
            {["Control No.","Particulars / Details","Type",...(showPrNumber?["P.R. No."]:[])].map(h=>(
              <th key={h} style={{ textAlign:"left", padding:"8px 12px", fontSize:11, fontWeight:700, color:"#fff", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaryDocuments.map((member,index)=>(
            <tr key={member?.id??`single-${index}`} style={{ borderBottom:"1px solid #E2E8F0" }}>
              <td style={{ padding:"10px 12px", fontSize:11, fontWeight:700, color:"#6C4FF5" }}>
                #{member?.id??record.controlNo}
              </td>
              <td style={{ padding:"10px 12px", fontSize:11, color:detailTextColor }}>
                {member?.particulars??doc?.particulars??record.particulars}
              </td>
              <td style={{ padding:"10px 12px", fontSize:11, fontWeight:600, color:"#1A2035" }}>
                {member?.type??doc?.type??record.type}
              </td>
              {showPrNumber&&(
                <td style={{ padding:"10px 12px", fontSize:11, color:detailTextColor }}>
                  {member?.prNumber?.trim()??""}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
      <section aria-label={`Office Journey in ${journeyOffice}`}>
      <div style={{ display:"flex", alignItems:"center", gap:8, margin:"0 4px 9px" }}>
        <span style={{ width:3, height:18, borderRadius:2, background:stepKey?({ cto:"#3B82F6", cbo:"#F59E0B", cao:"#10B981" } as Record<JourneyStepKey,string>)[stepKey]:"#6C4FF5" }}/>
        <h3 style={{ fontSize:13, fontWeight:700, color:"#1A2035", margin:0 }}>Office Journey in {journeyOffice}</h3>
      </div>
      <div style={{ borderRadius:16, overflow:"hidden", background:"#fff", border:"1px solid #E2E8F0" }}>
        {journeyVisits.length?journeyVisits.map((visit,index)=>{
          const receivedAction={ label:"Received", timestamp:visit.received, actor:visit.receivedBy, color:"#2563EB", empty:"Not received" };
          const signatureAction={ label:"For Signature", timestamp:visit.forSig, actor:undefined, color:"#7C3AED", empty:"Not signed" };
          const forwardedAction={ label:"Forwarded", timestamp:visit.forwarded, actor:visit.forwardedBy, color:"#059669", empty:"Not forwarded" };
          const actions=visit.office==="CA"
            ?[...(visit.received||!visit.forwarded?[receivedAction]:[]),...(visit.forwarded?[forwardedAction]:[])]
            :[receivedAction,signatureAction,forwardedAction];
          return (
            <article key={`${visit.office}-${index}`} style={{ padding:"14px 16px",
              borderBottom:index<journeyVisits.length-1?"1px solid #E2E8F0":"none" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#1A2035" }}>
                  {OFFICE_NAME[visit.office]??visit.office}
                  <span style={{ marginLeft:6, fontSize:10, fontWeight:500, color:mutedTextColor }}>Visit {index+1}</span>
                </div>
                {visit.forwardedTo&&<span style={{ fontSize:10, fontWeight:600, color:"#059669", whiteSpace:"nowrap" }}>
                  To {OFFICE_NAME[visit.forwardedTo]??visit.forwardedTo}
                </span>}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${actions.length},minmax(0,1fr))`, gap:8 }}>
                {actions.map(action=>{
                  const complete=!!action.timestamp;
                  return (
                    <div key={action.label} style={{ minWidth:0, borderRadius:10, padding:"9px 8px",
                      border:`1px solid ${complete?action.color+"35":"#E2E8F0"}`,
                      background:complete?action.color+"0D":"#F8FAFC" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5, color:complete?action.color:mutedTextColor }}>
                        <span aria-label={complete?"Complete":"Incomplete"} style={{ width:15, height:15, flexShrink:0,
                          display:"inline-flex", alignItems:"center", justifyContent:"center", borderRadius:"50%",
                          background:complete?action.color:"#E2E8F0", color:complete?"#fff":mutedTextColor, fontSize:10, fontWeight:700 }}>
                          {complete?"✓":"·"}
                        </span>
                        <span style={{ fontSize:10, lineHeight:1.2, fontWeight:700 }}>{action.label}</span>
                      </div>
                      <div style={{ marginTop:6, fontSize:10, fontWeight:600, color:complete?"#1A2035":mutedTextColor, lineHeight:1.35 }}>
                        {complete?fmtStepDate(action.timestamp!):action.empty}
                      </div>
                      {action.actor&&<div style={{ marginTop:4, fontSize:9, color:mutedTextColor, lineHeight:1.3, overflowWrap:"anywhere" }}>
                        {action.actor}
                      </div>}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        }):(
          <p style={{ padding:"16px", margin:0, color:mutedTextColor, fontSize:11 }}>No office activity has been recorded yet.</p>
        )}
      </div>
      </section>
    </div>
  );
}

// ─── CONFIRM ACTION MODAL ─────────────────────────────────────────────────────

function ConfirmActionModal({ action, targetOffice, nextOffices, staff, defaultActor, trackingDetails, submitting=false, onConfirm, onCancel }:{
  action:"receive"|"forward"|"complete"; targetOffice:string; nextOffices?:string[];
  staff?:OfficeStaffRow[]; defaultActor?:string; submitting?:boolean;
  trackingDetails?:{controlNo:string;particulars:string;type:string;office:string};
  onConfirm:(opts:{forwardedBy:string;forwardDest?:string})=>void; onCancel:()=>void;
}) {
  const [dest,setDest]=useState(nextOffices?.[0]??"");
  const [actor,setActor]=useState(staff?.[0]?`${staff[0].fullName} / ${staff[0].contactNumber}`:"");
  const [isOtherStaff,setIsOtherStaff]=useState(false);
  const [otherName,setOtherName]=useState("");
  const [otherContact,setOtherContact]=useState("");
  const [actorError,setActorError]=useState("");

  useEffect(()=>{
    if (!actor&&staff?.length) setActor(`${staff[0].fullName} / ${staff[0].contactNumber}`);
  },[actor,staff]);

  const confirmAction=()=>{
    if (staff!==undefined) {
      if (isOtherStaff||staff.length===0) {
        const name=otherName.trim();
        if (!name) { setActorError("Enter your name."); return; }
        if (!/^\d{11}$/.test(otherContact)) { setActorError("Enter a contact number with exactly 11 digits."); return; }
        onConfirm({ forwardedBy:`${name} / ${otherContact}`, forwardDest:dest });
        return;
      }
      if (!actor) { setActorError("Select your registered staff details or choose the other staff option."); return; }
      onConfirm({ forwardedBy:actor, forwardDest:dest });
      return;
    }
    if (!defaultActor) { setActorError("Add your 11-digit contact number in your profile before continuing."); return; }
    onConfirm({ forwardedBy:defaultActor, forwardDest:dest });
  };

  return createPortal((
    <div style={{ position:"fixed", inset:0, zIndex:1200, display:"flex", alignItems:"flex-end",
      justifyContent:"center", padding:16, background:"rgba(0,0,0,0.5)" }}>
      <div style={{ width:"100%", maxWidth:400, borderRadius:20, overflow:"hidden",
        background:"#fff", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"16px 20px", borderBottom:"1px solid #F0F2F8" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:14, fontWeight:700,
              background:"rgba(16,185,129,0.15)", color:"#10B981" }}>✓</div>
            <div>
              <p style={{ fontWeight:700, fontSize:13, color:"#1A2035", margin:0 }}>
                {action==="forward"?targetOffice:action==="complete"?"Complete Document Tracking":"Confirm Receipt"}
              </p>
              <p style={{ fontSize:11, color:"#8B93B0", margin:"2px 0 0" }}>
                {action==="forward"?"Please review the receiving office details before confirming."
                  :action==="complete"?"Are you sure you want to complete this document tracking?"
                    :"Confirm receipt of this document."}
              </p>
            </div>
          </div>
          <button onClick={onCancel} disabled={submitting}
            style={{ fontSize:20, color:"#8B93B0", background:"none", border:"none", cursor:submitting?"default":"pointer", lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          {action==="complete"&&trackingDetails&&(
            <div style={{ borderRadius:12, padding:12, background:"#F7F8FC", border:"1px solid #E2E8F0" }}>
              <p style={{ fontSize:11, fontWeight:700, color:"#1A2035", margin:"0 0 8px" }}>Completion details</p>
              {[
                ["Control number",`#${trackingDetails.controlNo}`],
                ["Particulars",trackingDetails.particulars||"—"],
                ["Document type",trackingDetails.type||"—"],
                ["Destination",trackingDetails.office],
              ].map(([label,value])=>(
                <p key={label} style={{ fontSize:11, color:"#475569", margin:"4px 0" }}>
                  <strong style={{ color:"#1A2035" }}>{label}:</strong> {value}
                </p>
              ))}
              <p style={{ fontSize:10, color:"#64748B", margin:"8px 0 0" }}>
                Completion date and time will be recorded when you confirm. This closes tracking only and does not change the document entry status.
              </p>
            </div>
          )}
          {action==="forward"&&nextOffices&&nextOffices.length>0&&(
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:"#1A2035", display:"block", marginBottom:6 }}>Forwarding to:</label>
              <select value={dest} onChange={e=>setDest(e.target.value)}
                style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:13,
                  border:"1px solid #E2E8F0", background:"#F7F8FC", color:"#1A2035", outline:"none" }}>
                {nextOffices.map(o=><option key={o} value={o}>{OFFICE_DISPLAY_NAME[o]??o}</option>)}
              </select>
            </div>
          )}
          {staff!==undefined&&(
            <div>
              <p style={{ fontSize:12, fontWeight:600, color:"#1A2035", margin:"0 0 8px" }}>
                Are you the registered staff member processing this document?
              </p>
              {staff.length>0&&(
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:10 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#1A2035" }}>
                    <input type="radio" name="processing-staff" checked={!isOtherStaff} onChange={()=>{setIsOtherStaff(false);setActorError("");}}/>
                    Yes, use my registered details
                  </label>
                  <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#1A2035" }}>
                    <input type="radio" name="processing-staff" checked={isOtherStaff} onChange={()=>{setIsOtherStaff(true);setActorError("");}}/>
                    No, I am another clerk or staff member
                  </label>
                </div>
              )}
              {!isOtherStaff&&staff.length>0&&(
                <select value={actor} onChange={e=>{setActor(e.target.value);setActorError("");}}
                  style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:13,
                    border:"1px solid #E2E8F0", background:"#F7F8FC", color:"#1A2035", outline:"none" }}>
                  {staff.map(member=>{
                    const value=`${member.fullName} / ${member.contactNumber}`;
                    return <option key={member.id} value={value}>{value}</option>;
                  })}
                </select>
              )}
              {(isOtherStaff||staff.length===0)&&(
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {staff.length===0&&<p style={{ fontSize:12, color:"#8B93B0", margin:0 }}>No registered staff are available. Enter your details to continue.</p>}
                  <input type="text" value={otherName} onChange={e=>{setOtherName(e.target.value);setActorError("");}}
                    placeholder="Your full name" aria-label="Your full name"
                    style={{ width:"100%", boxSizing:"border-box", borderRadius:10, padding:"10px 12px", fontSize:13,
                      border:"1px solid #E2E8F0", background:"#F7F8FC", color:"#1A2035", outline:"none" }}/>
                  <input type="tel" inputMode="numeric" maxLength={11} value={otherContact}
                    onChange={e=>{setOtherContact(e.target.value.replace(/\D/g,"").slice(0,11));setActorError("");}}
                    placeholder="Contact number (11 digits)" aria-label="Contact number, 11 digits"
                    style={{ width:"100%", boxSizing:"border-box", borderRadius:10, padding:"10px 12px", fontSize:13,
                      border:"1px solid #E2E8F0", background:"#F7F8FC", color:"#1A2035", outline:"none" }}/>
                </div>
              )}
              {actorError&&<p role="alert" style={{ fontSize:12, color:"#DC2626", margin:"8px 0 0" }}>{actorError}</p>}
            </div>
          )}
          {staff===undefined&&defaultActor&&(
            <p style={{ fontSize:12, color:"#64748B", margin:0 }}>Processed by: <strong>{defaultActor}</strong></p>
          )}
          {staff===undefined&&actorError&&<p role="alert" style={{ fontSize:12, color:"#DC2626", margin:0 }}>{actorError}</p>}
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:4 }}>
            <button onClick={confirmAction} disabled={submitting}
              style={{ width:"100%", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700,
                background:action==="complete"?"#10B981":"#6C4FF5", color:"#fff", border:"none", cursor:submitting?"wait":"pointer",
                opacity:submitting?0.75:1 }}>
              {submitting?"Saving...":action==="complete"?"Complete Tracking":"Confirm"}
            </button>
            <button onClick={onCancel} disabled={submitting}
              style={{ width:"100%", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700,
                background:"transparent", color:"#6C4FF5", border:"1px solid #6C4FF5", cursor:submitting?"default":"pointer",
                opacity:submitting?0.5:1 }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  ),document.body);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin, onGoSignup }:{
  onLogin:(u:string,p:string)=>void; onGoSignup:()=>void;
}) {
  const [u,setU]=useState(""), [p,setP]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const submit=()=>u&&p&&onLogin(u,p);

  return <main className="page-enter relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-3 sm:py-10"
    style={{
      minHeight:"100svh",
      backgroundImage:`linear-gradient(120deg,rgba(5,10,35,0.28),rgba(35,48,130,0.26)),url("${loginBackdropImg}")`,
      backgroundSize:"cover",
      backgroundPosition:"center",
    }}>
    <section className="relative z-10 w-full max-w-sm rounded-2xl border px-5 py-6 shadow-2xl sm:px-8 sm:py-7"
      aria-labelledby="login-heading"
      style={{
        background:"rgba(8,15,58,0.96)",
        borderColor:"rgba(255,255,255,0.16)",
        boxShadow:"0 24px 70px rgba(0,0,0,0.4)",
      }}>
      <div className="mb-6 flex flex-col items-center">
        <GingoogSeal size={104}/>
        <h1 id="login-heading" className="mt-3 text-2xl font-bold text-white">ADTRAQS</h1>
      </div>
      <div className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-white">Email Address</label>
          <input id="login-email" type="email" autoComplete="username" placeholder="Enter your email address" value={u}
            onChange={e=>setU(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submit()}
            className="h-12 w-full rounded-md border border-white/80 bg-white px-3 text-base text-[#151827] outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-sky-400"/>
        </div>
        <div>
          <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-white">Password</label>
          <div className="relative">
            <input id="login-password" type={showPassword?"text":"password"} autoComplete="current-password"
              placeholder="Enter your password" value={p}
              onChange={e=>setP(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&submit()}
              className="h-12 w-full rounded-md border border-white/80 bg-white py-3 pl-3 pr-12 text-base text-[#151827] outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-sky-400"/>
            <button type="button" onClick={()=>setShowPassword(value=>!value)}
              aria-label={showPassword?"Hide password":"Show password"}
              title={showPassword?"Hide password":"Show password"}
              className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
              {showPassword?<EyeOff size={19}/>:<Eye size={19}/>}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <a href="#" className="text-sm text-white underline-offset-2 hover:underline">Forgot Password?</a>
          </div>
        </div>
        <div className="space-y-3 pt-1">
          <button onClick={submit}
            className="h-12 w-full rounded-xl text-base font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#080844]"
            style={{ background:"linear-gradient(110deg,#080844,#397BA7)" }}>Login</button>
        </div>
        <button onClick={onGoSignup} className="sr-only">
          Sign Up
        </button>
      </div>
    </section>
  </main>;
}

function OfficeLoginScreen({ mode, onBack, onLogin }:{ mode:AppMode; onBack:()=>void; onLogin:(user:AuthUser)=>void }) {
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [contactNumber,setContactNumber]=useState("");
  const [error,setError]=useState("");
  const { theme }=useTheme();
  const office=MODE_OFFICE_NAME[mode];
  const submit=()=>{
    setError("");
    const fullName=`${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim() || !lastName.trim() || !contactNumber.trim()) {
      setError("First name, last name, and contact number are required.");
      return;
    }
    const officeLabel = office || "Office";
    onLogin({
      id: Date.now(),
      fullName,
      email: `${firstName.trim().toLowerCase()}.${lastName.trim().toLowerCase()}@office.local`,
      username: `${firstName.trim().toLowerCase()}.${lastName.trim().toLowerCase()}`,
      role: "staff",
      office: officeLabel,
      status: "Active",
      position: "Office Staff",
    });
  };
  return <AuthBg><AuthCard className="w-full max-w-sm">
    <div className="flex flex-col items-center mb-6"><GingoogSeal size={72}/><h1 className="text-xl font-bold tracking-widest mt-3" style={{color:theme==='dark'?'#fff':'#1A1D2B'}}>OFFICE ACCESS</h1><p className="text-xs mt-1" style={{color:theme==='dark'?'rgba(255,255,255,.45)':'#5C6178'}}>{office}</p></div>
    <div className="space-y-3">
      <AuthInput label="First Name" type="text" placeholder="Enter first name" value={firstName} onChange={setFirstName}/>
      <AuthInput label="Last Name" type="text" placeholder="Enter last name" value={lastName} onChange={setLastName}/>
      <AuthInput label="Office" type="text" value={office} />
      <AuthInput label="Contact Number" type="tel" placeholder="Enter contact number" value={contactNumber} onChange={setContactNumber}/>
      {error&&<p className="text-xs" style={{color:'#EF4444'}}>{error}</p>}
      <button onClick={submit} className="w-full rounded-lg py-2.5 text-sm font-bold text-white" style={{background:"linear-gradient(135deg,#6C4FF5,#3B2FBF)"}}>Continue to Office</button>
      <button onClick={onBack} className="w-full rounded-lg py-2.5 text-sm font-semibold" style={{background:'transparent',color:'#6C4FF5'}}>Back</button>
    </div>
  </AuthCard></AuthBg>;
}

// ─── SIGN UP ─────────────────────────────────────────────────────────────────

function SignUpScreen({ onBack, offices }:{ onBack:()=>void; offices:string[] }) {
  const [done,setDone]=useState(false), [agreed,setAgreed]=useState(false);
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const textColor=isDark?"rgba(255,255,255,0.45)":"#5C6178";

  if (done) return (
    <AuthBg>
      <AuthCard className="w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-5">
          <GingoogSeal size={72}/>
          <h1 className="text-xl font-bold tracking-widest mt-3" style={{ color:isDark?"#fff":"#1A1D2B" }}>ADTRAQS</h1>
        </div>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl"
          style={{ background:"rgba(16,185,129,0.2)", color:"#10B981", border:"1px solid rgba(16,185,129,0.3)" }}>✓</div>
        <h3 className="text-sm font-semibold mb-2" style={{ color:isDark?"#fff":"#1A1D2B" }}>Request Submitted</h3>
        <p className="text-xs mb-6" style={{ color:textColor }}>Your account will be reviewed by an administrator.</p>
        <button onClick={onBack} className="w-full rounded-lg py-2.5 text-sm font-bold text-white"
          style={{ background:"linear-gradient(135deg,#6C4FF5,#3B2FBF)" }}>← Back to Login</button>
      </AuthCard>
    </AuthBg>
  );
  return (
    <AuthBg>
      <AuthCard className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-6">
          <GingoogSeal size={80}/>
          <h1 className="text-2xl font-bold tracking-widest mt-3" style={{ color:isDark?"#fff":"#1A1D2B" }}>ADTRAQS</h1>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <AuthInput label="Full Name" placeholder="Enter full name"/>
            <AuthInput label="Email Address" type="email" placeholder="Enter email address"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AuthInput label="Position / Desk" placeholder="Enter your position"/>
            <AuthSelect label="Office / Department" placeholder="Select Office" options={offices}/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <AuthInput label="Username" placeholder="Create username"/>
            <AuthInput label="Password" type="password" placeholder="Create a password"/>
            <AuthInput label="Confirm Password" type="password" placeholder="Confirm your password"/>
          </div>
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} className="mt-0.5 accent-purple-500"/>
            <span className="text-xs" style={{ color:textColor }}>
              I agree to the <a href="#" className="underline" style={{ color:isDark?"rgba(255,255,255,0.7)":"#6C4FF5" }}>Terms of Service</a>
              {" "}and <a href="#" className="underline" style={{ color:isDark?"rgba(255,255,255,0.7)":"#6C4FF5" }}>Privacy Policy</a>
            </span>
          </label>
          <button onClick={()=>agreed&&setDone(true)} disabled={!agreed}
            className="w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background:"linear-gradient(135deg,#6C4FF5,#3B2FBF)" }}>Sign Up</button>
          <p className="text-center text-xs" style={{ color:textColor }}>
            Already have an account?{" "}
            <button onClick={onBack} className="font-semibold hover:underline"
              style={{ color:isDark?"rgba(255,255,255,0.65)":"#6C4FF5" }}>Login</button>
          </p>
        </div>
      </AuthCard>
    </AuthBg>
  );
}

// ─── USER DROPDOWN ───────────────────────────────────────────────────────────

function UserDropdown({ onProfile, onLogout, user }:{
  onProfile:()=>void; onLogout:()=>void; user:AuthUser;
}) {
  const [open,setOpen]=useState(false);
  const C=useC();
  return (
    <div className="relative">
      <button onClick={()=>setOpen(o=>!o)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 border"
        style={{ background:C.card2, borderColor:C.border }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background:"linear-gradient(135deg,#6C4FF5,#4C35D4)" }}>{user.fullName.charAt(0).toUpperCase()}</div>
        <div className="text-left">
          <p className="text-xs font-semibold leading-tight" style={{ color:C.text }}>{user.fullName}</p>
          <p className="text-xs leading-tight" style={{ color:C.muted }}>{user.role==="admin"?"Administrator":"Staff"}</p>
        </div>
        <span className="text-xs ml-1" style={{ color:C.muted }}>▾</span>
      </button>
      {open&&(
        <>
          <div className="fixed inset-0 z-40" onClick={()=>setOpen(false)}/>
          <div className="absolute right-0 top-full mt-2 w-64 rounded-xl z-50 overflow-hidden"
            style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 12px 40px rgba(0,0,0,0.3)" }}>
            <div className="px-4 py-4 border-b" style={{ borderColor:C.border }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold"
                  style={{ background:"linear-gradient(135deg,#6C4FF5,#4C35D4)" }}>{user.fullName.charAt(0).toUpperCase()}</div>
                <div>
                  <p className="text-sm font-bold" style={{ color:C.text }}>{user.fullName}</p>
                  <p className="text-xs" style={{ color:C.muted }}>{user.email}</p>
                </div>
              </div>
              <div className="rounded-lg px-3 py-2 flex justify-between" style={{ background:C.card2 }}>
                <span className="text-xs" style={{ color:C.muted }}>Role</span>
                <span className="text-xs font-semibold" style={{ color:user.role==="admin"?C.purple:C.blue }}>
                  {user.role==="admin"?"Administrator":"Staff"}
                </span>
              </div>
            </div>
            <div className="py-1.5">
              <button onClick={()=>{ setOpen(false); onProfile(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-left"
                style={{ color:C.sub }}>◉ View Profile</button>
              <div className="mx-3 my-1" style={{ height:1, background:C.border }}/>
              <button onClick={()=>{ setOpen(false); onLogout(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-left"
                style={{ color:C.red }}>⎋ Logout</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

function AppShell({ screen, setScreen, role, user, onLogout, onRefresh, refreshing, notifications, children }:{
  screen:AppScreen; setScreen:(s:AppScreen)=>void;
  role:Role; user:AuthUser | null; onLogout:()=>void; onRefresh:()=>void; refreshing:boolean;
  notifications:TrackingNotification[]; children:React.ReactNode;
}) {
  const [collapsed,setCollapsed]=useState(false);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const C=useC();
  const { theme }=useTheme();
  const isDark=theme==="dark";

  const staffNav:{ id:AppScreen; label:string; icon:string }[]=[
    { id:"dashboard",           label:"Dashboard",          icon:"⊡" },
    { id:"document-tracker",    label:"Document Entry",     icon:"≡" },
    { id:"tracking-monitoring", label:"Tracking Monitoring",icon:"⊕" },
    { id:"reports",             label:"Reports",            icon:"▦" },
  ];
  const adminNav:{ id:AppScreen; label:string; icon:string; badge?:string }[]=[
    { id:"dashboard",           label:"Dashboard",          icon:"⊡" },
    { id:"document-tracker",    label:"Document Entry",     icon:"≡", badge:"View Only" },
    { id:"tracking-monitoring", label:"Tracking Monitoring",icon:"⊕" },
    { id:"reports",             label:"Reports",            icon:"▦" },
    { id:"user-management",     label:"User Management",    icon:"⊙" },
    { id:"settings",            label:"Settings",           icon:"⚙" },
  ];
  const nav=role==="admin"?adminNav:staffNav;

  const sidebarBorder=isDark?`1px solid ${C.border}`:`1px solid ${C.border}`;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:C.bg, fontFamily:"Inter,sans-serif" }}>
      <aside className={`${collapsed?"w-12":"w-56"} flex-shrink-0 flex flex-col`}
        style={{ background:C.sidebar, borderRight:sidebarBorder,
          boxShadow:isDark?"none":"2px 0 12px rgba(0,0,0,0.05)" }}>
        <div className={`h-14 flex items-center border-b ${collapsed?"justify-center":"px-3 gap-2"}`}
          style={{ borderColor:C.border }}>
          <GingoogSeal size={28}/>
          {!collapsed&&(
            <>
              <span className="text-base font-bold flex-1 ml-1 whitespace-nowrap" style={{ color:C.text }}>ADTRAQS</span>
              <button onClick={()=>setCollapsed(true)} className="text-xs opacity-40 hover:opacity-70"
                style={{ color:C.sub }}>◀</button>
            </>
          )}
        </div>
        {collapsed&&<button onClick={()=>setCollapsed(false)}
          className="py-1 text-xs text-center opacity-40 hover:opacity-70" style={{ color:C.sub }}>▶</button>}
        <nav className="flex-1 py-2 overflow-y-auto">
          {nav.map(item=>{
            const active=screen===item.id;
            return (
              <button key={item.id} onClick={()=>setScreen(item.id)}
                title={collapsed?item.label:undefined}
                className={`w-full flex items-center gap-2.5 py-2.5 text-sm font-medium ${collapsed?"justify-center px-0":"px-4"}`}
                style={{ background:active?"rgba(108,79,245,0.12)":"transparent",
                  color:active?C.purple:C.sub,
                  borderRight:active?`2px solid ${C.purple}`:"2px solid transparent" }}>
                <span className="w-4 text-center text-sm flex-shrink-0">{item.icon}</span>
                {!collapsed&&<span className="flex-1 text-left">{item.label}</span>}
                {!collapsed&&(item as any).badge&&(
                  <span className="text-xs px-1.5 py-0.5 rounded ml-auto"
                    style={{ background:"rgba(59,130,246,0.15)", color:C.blue, fontSize:9 }}>
                    {(item as any).badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-5 flex-shrink-0 border-b gap-3"
          style={{ background:C.sidebar, borderColor:C.border,
            boxShadow:isDark?"none":"0 2px 8px rgba(0,0,0,0.04)" }}>
          <div className="flex-1"/>
          <button onClick={onRefresh} disabled={refreshing} title="Refresh data"
            className={refreshing?"animate-spin":""}
            style={{ width:32, height:32, borderRadius:8, border:`1px solid ${C.border}`,
              background:C.card2, color:C.sub, cursor:refreshing?"wait":"pointer", fontSize:16,
              display:"flex", alignItems:"center", justifyContent:"center", padding:0, boxSizing:"border-box" }}>
            ↻
          </button>
          <div className="relative">
            <button onClick={()=>setNotificationsOpen(open=>!open)} title="Notifications" aria-label="Notifications"
              style={{ width:32, height:32, borderRadius:8, border:`1px solid ${C.border}`,
                background:C.card2, color:C.sub, cursor:"pointer", fontSize:16, position:"relative",
                display:"flex", alignItems:"center", justifyContent:"center", padding:0, boxSizing:"border-box" }}>
              <Bell size={17} strokeWidth={2} aria-hidden="true"/>
              {notifications.length>0&&<span style={{ position:"absolute", top:-5, right:-5, minWidth:16,
                height:16, padding:"0 3px", borderRadius:99, background:C.red, color:"#fff",
                fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {notifications.length>9?"9+":notifications.length}
              </span>}
            </button>
            {notificationsOpen&&<>
              <div className="fixed inset-0 z-40" onClick={()=>setNotificationsOpen(false)}/>
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl z-50 overflow-hidden"
                style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 12px 40px rgba(0,0,0,0.3)" }}>
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor:C.border }}>
                  <span className="text-xs font-bold" style={{ color:C.text }}>Notifications</span>
                  <span className="text-xs" style={{ color:C.muted }}>{notifications.length} active</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length===0?<p className="px-4 py-5 text-xs" style={{ color:C.muted }}>No tracking notifications.</p>:
                    notifications.slice(0,8).map(notification=>(
                      <button key={notification.id} onClick={()=>{ setNotificationsOpen(false); setScreen("tracking-monitoring"); }}
                        className="w-full text-left px-4 py-3 border-b"
                        style={{ borderColor:C.border, background:"transparent" }}>
                        <div className="flex items-center gap-2">
                          <span style={{ color:notification.tone==="warning"?"#F59E0B":C.blue }}>●</span>
                          <span className="text-xs font-semibold" style={{ color:C.text }}>{notification.title}</span>
                        </div>
                        <p className="text-xs mt-1 ml-4" style={{ color:C.muted }}>{notification.detail}</p>
                      </button>
                    ))}
                </div>
                <button onClick={()=>{ setNotificationsOpen(false); setScreen("tracking-monitoring"); }}
                  className="w-full px-4 py-2.5 text-xs font-semibold" style={{ color:C.purple, background:C.card2 }}>
                  Open Tracking Monitoring
                </button>
              </div>
            </>}
          </div>
          <ThemeToggleBtn/>
          {user && <UserDropdown onProfile={()=>setScreen("profile")} onLogout={onLogout} user={user}/>}
        </header>
        <main className="flex-1 overflow-y-auto page-enter" key={screen}>{children}</main>
      </div>
    </div>
  );
}

// ─── FLAG MODALS ─────────────────────────────────────────────────────────────

function FlagModal({ docId, onConfirm, onCancel }:{
  docId:string; onConfirm:(reason:string)=>void; onCancel:()=>void;
}) {
  const [reason,setReason]=useState("");
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center",
      justifyContent:"center", padding:16, background:"rgba(0,0,0,0.6)" }}>
      <div style={{ width:"100%", maxWidth:400, borderRadius:20, overflow:"hidden",
        background:"#fff", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #F0F2F8",
          display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center",
            justifyContent:"center", background:"rgba(249,115,22,0.12)", fontSize:16 }}>⚑</div>
          <div>
            <p style={{ fontWeight:700, fontSize:13, color:"#1A2035", margin:0 }}>Flag Document #{docId}</p>
            <p style={{ fontSize:11, color:"#8B93B0", margin:"2px 0 0" }}>This document will be marked as Flagged.</p>
          </div>
        </div>
        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1A2035", marginBottom:6 }}>
              Reason <span style={{ color:"#F97316" }}>*</span>
            </label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)}
              rows={3} placeholder="e.g. Not received at CTO after 5 days, physically misplaced during transfer…"
              style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:13,
                border:"1px solid #E2E8F0", background:"#F7F8FC", color:"#1A2035",
                outline:"none", resize:"none", boxSizing:"border-box", lineHeight:1.5 }}/>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:4 }}>
            <button disabled={!reason.trim()} onClick={()=>onConfirm(reason.trim())}
              style={{ width:"100%", borderRadius:12, padding:"11px", fontSize:14, fontWeight:700,
                background:reason.trim()?"#F97316":"#CBD5E1", color:"#fff", border:"none",
                cursor:reason.trim()?"pointer":"default" }}>
              ⚑ Flag Document
            </button>
            <button onClick={onCancel}
              style={{ width:"100%", borderRadius:12, padding:"11px", fontSize:14, fontWeight:700,
                background:"transparent", color:"#6C4FF5", border:"1px solid #6C4FF5", cursor:"pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResolveFlagModal({ doc, onConfirm, onChangeDetails, onCancel }:{
  doc:DocRecord; onConfirm:(note:string)=>void; onChangeDetails:()=>void; onCancel:()=>void;
}) {
  const [note,setNote]=useState("");
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center",
      justifyContent:"center", padding:16, background:"rgba(0,0,0,0.6)" }}>
      <div style={{ width:"100%", maxWidth:420, borderRadius:20, overflow:"hidden",
        background:"#fff", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #F0F2F8",
          display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center",
            justifyContent:"center", background:"rgba(16,185,129,0.12)", fontSize:16 }}>✓</div>
          <div>
            <p style={{ fontWeight:700, fontSize:13, color:"#1A2035", margin:0 }}>Resolve Flag — #{doc.id}</p>
            <p style={{ fontSize:11, color:"#8B93B0", margin:"2px 0 0" }}>Document will return to its previous state.</p>
          </div>
        </div>
        <div style={{ padding:"14px 20px", background:"rgba(249,115,22,0.06)",
          borderBottom:"1px solid rgba(249,115,22,0.15)" }}>
          <p style={{ fontSize:11, fontWeight:600, color:"#F97316", margin:"0 0 2px" }}>Current Flag Reason:</p>
          <p style={{ fontSize:12, color:"#1A2035", margin:0 }}>{doc.flagData?.reason??""}</p>
          <p style={{ fontSize:10, color:"#8B93B0", margin:"4px 0 0" }}>
            Flagged by {doc.flagData?.flaggedBy} · {doc.flagData?.flaggedAt}
          </p>
        </div>
        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#1A2035", marginBottom:6 }}>
              Resolution Note <span style={{ color:"#10B981" }}>*</span>
            </label>
            <textarea value={note} onChange={e=>setNote(e.target.value)}
              rows={3} placeholder="Describe how the issue was resolved…"
              style={{ width:"100%", borderRadius:10, padding:"10px 12px", fontSize:13,
                border:"1px solid #E2E8F0", background:"#F7F8FC", color:"#1A2035",
                outline:"none", resize:"none", boxSizing:"border-box", lineHeight:1.5 }}/>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:4 }}>
            <button onClick={onChangeDetails}
              style={{ width:"100%", borderRadius:12, padding:"11px", fontSize:14, fontWeight:700,
                background:"rgba(108,79,245,0.12)", color:"#6C4FF5", border:"1px solid #6C4FF5", cursor:"pointer" }}>
              Change Document Details
            </button>
            <button disabled={!note.trim()} onClick={()=>onConfirm(note.trim())}
              style={{ width:"100%", borderRadius:12, padding:"11px", fontSize:14, fontWeight:700,
                background:note.trim()?"#10B981":"#CBD5E1", color:"#fff", border:"none",
                cursor:note.trim()?"pointer":"default" }}>
              ✓ Resolve Flag
            </button>
            <button onClick={onCancel}
              style={{ width:"100%", borderRadius:12, padding:"11px", fontSize:14, fontWeight:700,
                background:"transparent", color:"#6C4FF5", border:"1px solid #6C4FF5", cursor:"pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeDocumentDetailsModal({ doc, nextId, catalog, userId, onSave, onCancel }:{
  doc:DocRecord; nextId:string; catalog:CatalogData; userId:number; onSave:(doc:DocRecord)=>void; onCancel:()=>void;
}) {
  const C=useC();
  const [form,setForm]=useState({
    type:doc.type, subType:doc.subType??"", office:doc.office, payrollVoucher:doc.payrollVoucher,
    particulars:doc.particulars, fund:doc.fund, amount:String(doc.amount), signature:doc.signature,
    chequeNo:doc.chequeNo??"", prNumber:doc.prNumber??"", status:(doc.previousStatus??"For Signature") as DocStatus,
  });
  const [loading,setLoading]=useState(false);
  const update=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));
  const save=async()=>{
    setLoading(true);
    const enteredAt=nowTs();
    const newDoc:DocRecord={
      id:nextId, date:enteredAt.slice(0,10), type:form.type as DocRecord["type"], subType:form.subType,
      office:form.office, payrollVoucher:form.payrollVoucher, particulars:form.particulars, fund:form.fund,
      amount:parseFloat(form.amount)||0, signature:form.signature, dateForwarded:"", status:form.status,
      chequeNo:form.chequeNo, prNumber:form.prNumber,
    };
    try {
      const response=await fetch('/api/docs-crud.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        control_no:newDoc.id, date_entered:newDoc.date, type:newDoc.type, sub_type:newDoc.subType,
        office:newDoc.office, payroll_voucher:newDoc.payrollVoucher, particulars:newDoc.particulars,
        fund:newDoc.fund, amount:newDoc.amount, signature:newDoc.signature, date_forwarded:null,
        status:newDoc.status, cheque_no:newDoc.chequeNo, pr_number:doc.prNumber, date_returned:null,
        user_id:userId,
      })});
      if (!response.ok) throw new Error('Unable to create replacement document');
      onSave({...newDoc,prNumber:doc.prNumber});
    } catch (error) {
      console.error('Replacement document error',error);
      alert('Unable to create the replacement document.');
    } finally { setLoading(false); }
  };
  return <ModalOverlay onClose={onCancel} wide>
    <div className="text-sm font-bold mb-1" style={{ color:C.text }}>Change Document Details — #{doc.id}</div>
    <p className="text-xs mb-4" style={{ color:C.muted }}>A new document entry will be created with the same P.R. Number: {doc.prNumber||"—"}</p>
    <div className="grid grid-cols-2 gap-4">
      <Field label="New Control Number"><TInput value={nextId} readOnly/></Field>
      <Field label="Type"><TSelect options={catalog.types} value={form.type} onChange={v=>update("type",v)}/></Field>
      <Field label="Type (Secondary)"><TInput value={form.subType} onChange={v=>update("subType",v)}/></Field>
      <Field label="Office"><TSelect options={catalog.offices} value={form.office} onChange={v=>update("office",v)}/></Field>
      <Field label="Payroll / Voucher"><TInput value={form.payrollVoucher} onChange={v=>update("payrollVoucher",v)}/></Field>
      <Field label="Particular / Details"><TInput value={form.particulars} onChange={v=>update("particulars",v)}/></Field>
      <Field label="Fund"><TSelect options={catalog.funds} value={form.fund} onChange={v=>update("fund",v)}/></Field>
      <Field label="Amount"><TInput type="number" value={form.amount} onChange={v=>update("amount",v)}/></Field>
      <Field label="Signature"><TSelect options={catalog.signatures} value={form.signature} onChange={v=>update("signature",v)}/></Field>
      <Field label="Cheque No."><TInput value={form.chequeNo} onChange={v=>update("chequeNo",v.replace(/\D/g,""))}/></Field>
      <Field label="P.R. Number (preserved)"><TInput value={doc.prNumber??""} readOnly/></Field>
      <Field label="Return Status"><TSelect options={["For Signature","Completed"]} value={form.status} onChange={v=>update("status",v)}/></Field>
    </div>
    <div className="flex justify-end gap-3 mt-5 pt-4" style={{ borderTop:`1px solid ${C.border}` }}>
      <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      <Btn disabled={loading} onClick={()=>void save()}>{loading?"Saving...":"Create New Document"}</Btn>
    </div>
  </ModalOverlay>;
}

// ─── BOTTLENECK CHART ─────────────────────────────────────────────────────────

const BOTTLENECK_COLORS:Record<"CTO"|"CBO"|"CAO",string> = { CBO:"#EF4444", CTO:"#F97316", CAO:"#EAB308" };

function formatProcessingDuration(days:number) {
  return days<1?`${(days*24).toFixed(1)} hours avg`:`${days.toFixed(1)} days avg`;
}

function BottleneckCard({ trackingRecords=[] }:{ trackingRecords?:TrackingRecord[] }) {
  const C=useC();
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const nowParts=getSystemDateParts(new Date());
  const weekStart=new Date(Date.UTC(Number(nowParts.year),Number(nowParts.month)-1,Number(nowParts.day)));
  weekStart.setUTCDate(weekStart.getUTCDate()-((weekStart.getUTCDay()+6)%7));
  const weekStartMs=parseSystemTimestamp(`${weekStart.toISOString().slice(0,10)} 00:00`).getTime();
  const weekEndMs=weekStartMs+7*86400000;
  const data=(["CTO","CBO","CAO"] as const).map(office=>{
    const durations=trackingRecords.flatMap(record=>{
      const legacyStep=office==="CTO"?record.cto:office==="CBO"?record.cbo:record.cao;
      const steps=record.visits
        ?record.visits.filter(visit=>visit.office===office)
        :legacyStep?[legacyStep]:[];
      return steps.flatMap(step=>{
        if (!step.received||!step.forwarded) return [];
        const receivedAt=parseSystemTimestamp(step.received).getTime();
        const forwardedAt=parseSystemTimestamp(step.forwarded).getTime();
        if (!Number.isFinite(receivedAt)||!Number.isFinite(forwardedAt)||
            forwardedAt<weekStartMs||forwardedAt>=weekEndMs||forwardedAt<receivedAt) return [];
        return [(forwardedAt-receivedAt)/86400000];
      });
    });
    return { office, avg:durations.length?durations.reduce((sum,value)=>sum+value,0)/durations.length:null, color:BOTTLENECK_COLORS[office] };
  });
  const sorted=[...data].sort((a,b)=>{
    if (a.avg===null) return b.avg===null?0:1;
    if (b.avg===null) return -1;
    return b.avg-a.avg;
  });
  const slowest=sorted.find(item=>item.avg!==null);
  const slowestAvg=slowest?.avg;
  const maxAvg=Math.max(...sorted.map(item => item.avg ?? 0),1);

  return (
    <div className="rounded-2xl border p-5" style={{
      background:C.card, borderColor:C.border,
      boxShadow:isDark?"0 4px 24px rgba(0,0,0,0.35)":"0 4px 24px rgba(0,0,0,0.08)",
    }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color:C.muted }}>Office Bottleneck</p>
          <p className="text-sm font-bold" style={{ color:C.text }}>Average Processing Time</p>
        </div>
        <div className="rounded-xl px-3 py-2 text-center" style={{
          background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)" }}>
          <p style={{ fontSize:9, fontWeight:600, color:"#EF4444", margin:"0 0 2px", whiteSpace:"nowrap" }}>
            SLOWEST THIS WEEK
          </p>
          <p style={{ fontSize:13, fontWeight:800, color:"#EF4444", margin:0 }}>{slowest?slowest.office:"No data"}</p>
          <p style={{ fontSize:10, color:"#EF4444", margin:0, opacity:0.8 }}>
            {slowestAvg==null?"No completed steps this week":formatProcessingDuration(slowestAvg)}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {sorted.map(item=>{
          const pct = item.avg == null || maxAvg===0 ? 0 : (item.avg / maxAvg) * 100;
          return (
            <div key={item.office}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color:C.text }}>{item.office}</span>
                <span className="text-xs font-bold" style={{ color:item.color }}>
                  {item.avg===null?"No data":formatProcessingDuration(item.avg)}
                </span>
              </div>
              <div style={{ height:10, borderRadius:6, background:isDark?"rgba(255,255,255,0.06)":"#E9EBF3", overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${item.avg===null?0:pct}%`, borderRadius:6,
                  background:`linear-gradient(90deg,${item.color}99,${item.color})`,
                  boxShadow:`0 0 6px ${item.color}55`, transition:"width 0.5s" }}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function Dashboard({ role, setScreen, docs, trackingRecords, groupTrackingRecords, user, catalog }:{ role:Role; setScreen:(s:AppScreen)=>void; docs:DocRecord[]; trackingRecords:TrackingRecord[]; groupTrackingRecords:GroupTrackingRecord[]; user:AuthUser; catalog:CatalogData }) {
  const C=useC();
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const [entryPeriod,setEntryPeriod]=useState<"all"|"week"|"month"|"year">("all");
  const [isEntryPeriodMenuOpen,setIsEntryPeriodMenuOpen]=useState(false);
  const [selectedTotalSignature,setSelectedTotalSignature]=useState<string|null>(null);
  const [isTotalSignatureMenuOpen,setIsTotalSignatureMenuOpen]=useState(false);
  const [selectedSignature,setSelectedSignature]=useState<string|null>(null);
  const [isSignatureMenuOpen,setIsSignatureMenuOpen]=useState(false);
  const entryPeriodMenuRef=useRef<HTMLDivElement>(null);
  const totalSignatureMenuRef=useRef<HTMLDivElement>(null);
  const signatureMenuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if (!isEntryPeriodMenuOpen&&!isTotalSignatureMenuOpen&&!isSignatureMenuOpen) return;
    const closeOnOutsideClick=(event:PointerEvent)=>{
      const target=event.target as Node;
      if (!entryPeriodMenuRef.current?.contains(target)) setIsEntryPeriodMenuOpen(false);
      if (!totalSignatureMenuRef.current?.contains(target)) setIsTotalSignatureMenuOpen(false);
      if (!signatureMenuRef.current?.contains(target)) setIsSignatureMenuOpen(false);
    };
    const closeOnEscape=(event:KeyboardEvent)=>{
      if (event.key==="Escape") {
        setIsEntryPeriodMenuOpen(false);
        setIsTotalSignatureMenuOpen(false);
        setIsSignatureMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown",closeOnOutsideClick);
    document.addEventListener("keydown",closeOnEscape);
    return ()=>{
      document.removeEventListener("pointerdown",closeOnOutsideClick);
      document.removeEventListener("keydown",closeOnEscape);
    };
  },[isEntryPeriodMenuOpen,isTotalSignatureMenuOpen,isSignatureMenuOpen]);
  const now=new Date();
  const nowParts=getSystemDateParts(now);
  const dateKey=(date:Date)=>{
    const pad=(value:number)=>String(value).padStart(2,"0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
  };
  const TODAY=`${nowParts.year}-${nowParts.month}-${nowParts.day}`, MONTH=TODAY.slice(0,7), YEAR=TODAY.slice(0,4);
  const weekStart=new Date(Date.UTC(Number(nowParts.year),Number(nowParts.month)-1,Number(nowParts.day)));
  const daysSinceMonday=(weekStart.getUTCDay()+6)%7;
  weekStart.setUTCDate(weekStart.getUTCDate()-daysSinceMonday);
  const weekEnd=new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate()+6);
  const formatPeriodDate=(date:Date)=>new Intl.DateTimeFormat(undefined,{timeZone:SYSTEM_TIME_ZONE,month:"short",day:"numeric",year:"numeric"}).format(date);
  const signatureOptions=Array.from(new Set(catalog.signatures.map(signature=>signature.trim()).filter(Boolean)));
  const getDashboardStatus=(doc:DocRecord):DocStatus=>{
    const individualForward=trackingRecords.find(record=>record.controlNo===doc.id)?.visits?.some(visit=>
      visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded
    );
    const groupForward=groupTrackingRecords.find(group=>group.documents.some(member=>member.id===doc.id))?.visits?.some(visit=>
      visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded
    );
    const savedForward=!!doc.dateForwarded&&!doc.dateForwarded.startsWith("0000-");
    return doc.status==="Completed"||individualForward||groupForward||savedForward?"Completed":"For Signature";
  };
  const todayDocs=docs.filter(doc=>doc.date===TODAY);
  const forSig=todayDocs.filter(doc=>getDashboardStatus(doc)==="For Signature");
  const completed=todayDocs.filter(doc=>getDashboardStatus(doc)==="Completed");
  const statusDocs=selectedSignature===null
    ?todayDocs
    :todayDocs.filter(doc=>getCatalogSignature(doc.signature,signatureOptions)===selectedSignature);
  const donut=[
    { name:"For Signature", value:statusDocs.filter(doc=>getDashboardStatus(doc)==="For Signature").length, color:C.blue },
    { name:"Completed", value:statusDocs.filter(doc=>getDashboardStatus(doc)==="Completed").length, color:C.purple },
  ];
  const total=statusDocs.length;

  const typeOptions=Array.from(new Set([...catalog.types,...docs.map(doc=>doc.type)]));

  const sigBars=signatureOptions.map(signature=>{
    const [code,...nameParts]=signature.split(" – ");
    return {
      name:nameParts.length?`${code} · ${nameParts.join(" – ")}`:code,
      sigCount:docs.filter(doc=>getCatalogSignature(doc.signature,signatureOptions)===signature).length,
    };
  });

  const TYPE_COLORS=["#6C4FF5","#3B82F6","#8B5CF6","#A78BFA","#14B8A6","#F59E0B"];
  const typeBars=typeOptions.map((t,i)=>({
    name:t, typeCount:docs.filter(d=>d.type===t).length, fill:TYPE_COLORS[i % TYPE_COLORS.length],
  }));

  const weekStartKey=dateKey(weekStart);
  const entryPeriodLabel={ all:"All time", week:"This week", month:"This month", year:"This year" }[entryPeriod];
  const totalEntries=docs.filter(doc=>{
    if (entryPeriod==="week") return doc.date>=weekStartKey&&doc.date<=dateKey(weekEnd);
    if (entryPeriod==="month") return doc.date.startsWith(MONTH);
    if (entryPeriod==="year") return doc.date.startsWith(YEAR);
    return true;
  }).length;
  const latestControlNumber=docs.reduce((latest,doc)=>
    Number(doc.id)>Number(latest)?doc.id:latest,"" as string);
  const totalSignatures=selectedTotalSignature===null
    ?docs.filter(doc=>doc.signature.trim().length>0).length
    :docs.filter(doc=>getCatalogSignature(doc.signature,signatureOptions)===selectedTotalSignature).length;

  const cardShadow=isDark
    ?"0 4px 20px rgba(0,0,0,0.4)"
    :"0 4px 20px rgba(0,0,0,0.07)";

  const LT=isDark
    ? { headerBg:C.sidebar, headerText:C.text, rowBg:C.card, rowAltBg:C.card2, rowBorder:C.border,
        text:C.text, sub:C.sub, muted:C.muted, link:C.purple }
    : { headerBg:"#0D1021", headerText:"#FFFFFF", rowBg:"#FFFFFF", rowAltBg:"#F7F8FC", rowBorder:"#E2E8F0",
        text:"#1A2035", sub:"#111827", muted:"#111827", link:"#6C4FF5" };
  const dashboardDate=new Intl.DateTimeFormat(undefined,{
    timeZone:SYSTEM_TIME_ZONE,weekday:"long",month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",
  }).format(now);

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between dashboard-reveal" style={{ animationDelay:"60ms" }}>
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color:C.text }}>{dashboardDate}</h2>
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label:"Total Entries", value:totalEntries, detail:entryPeriodLabel },
          { label:"Documents Received Today", value:todayDocs.length, detail:formatPeriodDate(now) },
          { label:"Latest Control Number", value:latestControlNumber||"—", detail:"Most recent staff entry" },
          { label:"Total Signatures", value:totalSignatures, detail:selectedTotalSignature??"Assigned across all entries" },
        ].map((stat,index)=>(
          <div key={stat.label} className="relative rounded-lg border p-4 dashboard-reveal"
            style={{ background:C.card, borderColor:C.border, boxShadow:cardShadow, animationDelay:`${140+index*70}ms`,
              zIndex:(index===0&&isEntryPeriodMenuOpen)||(index===3&&isTotalSignatureMenuOpen)?30:undefined }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="text-sm font-semibold leading-tight" style={{ color:C.text }}>{stat.label}</span>
              {index===0&&(
                <div className="relative" ref={entryPeriodMenuRef}>
                  <button type="button" aria-label={`Filter total entries by period: ${entryPeriodLabel}`}
                    aria-haspopup="menu" aria-expanded={isEntryPeriodMenuOpen}
                    onClick={()=>setIsEntryPeriodMenuOpen(open=>!open)}
                    className="flex h-7 w-8 items-center justify-center rounded-md border outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{ background:C.card2, borderColor:C.border, color:C.sub }}>
                    <ChevronDown aria-hidden="true" className="h-4 w-4"/>
                  </button>
                  {isEntryPeriodMenuOpen&&(
                    <div role="menu" aria-label="Total entries period"
                      className="absolute right-0 top-full z-20 mt-2 w-32 overflow-hidden rounded-md border py-1 shadow-lg"
                      style={{ background:C.card, borderColor:C.border }}>
                      {([
                        ["week","Week"],
                        ["month","Month"],
                        ["year","Year"],
                      ] as const).map(([value,label])=>(
                        <button key={value} type="button" role="menuitemradio" aria-checked={entryPeriod===value}
                          onClick={()=>{ setEntryPeriod(value); setIsEntryPeriodMenuOpen(false); }}
                          className="w-full px-3 py-2 text-left text-xs transition-colors hover:brightness-95"
                          style={{ background:entryPeriod===value?C.card2:C.card, color:C.sub }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {index===3&&(
                <div className="relative" ref={totalSignatureMenuRef}>
                  <button type="button"
                    aria-label={`Filter total signatures by name${selectedTotalSignature?`: ${selectedTotalSignature}`:""}`}
                    aria-haspopup="menu" aria-expanded={isTotalSignatureMenuOpen}
                    onClick={()=>{ setIsEntryPeriodMenuOpen(false); setIsSignatureMenuOpen(false); setIsTotalSignatureMenuOpen(open=>!open); }}
                    className="flex h-7 w-8 items-center justify-center rounded-md border outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{ background:C.card2, borderColor:C.border, color:C.sub }}>
                    <ChevronDown aria-hidden="true" className="h-4 w-4"/>
                  </button>
                  {isTotalSignatureMenuOpen&&(
                    <div role="menu" aria-label="Filter total signatures by name"
                      className="absolute right-0 top-full z-20 mt-2 max-h-56 w-60 overflow-y-auto rounded-md border py-1 shadow-lg"
                      style={{ background:C.card, borderColor:C.border }}>
                      <button type="button" role="menuitemradio" aria-checked={selectedTotalSignature===null}
                        onClick={()=>{ setSelectedTotalSignature(null); setIsTotalSignatureMenuOpen(false); }}
                        className="w-full px-3 py-2 text-left text-xs transition-colors hover:brightness-95"
                        style={{ background:selectedTotalSignature===null?C.card2:C.card, color:C.sub }}>
                        All signatures
                      </button>
                      {signatureOptions.map(signature=>(
                        <button key={signature} type="button" role="menuitemradio"
                          aria-checked={selectedTotalSignature===signature}
                          onClick={()=>{ setSelectedTotalSignature(signature); setIsTotalSignatureMenuOpen(false); }}
                          className="w-full px-3 py-2 text-left text-xs transition-colors hover:brightness-95"
                          style={{ background:selectedTotalSignature===signature?C.card2:C.card, color:C.sub }}>
                          {signature}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="text-2xl font-bold leading-none" style={{ color:C.text }}>{stat.value}</div>
            {(index!==0||entryPeriod!=="all")&&(
              <div className="mt-1 text-xs font-medium" style={{ color:C.muted }}>{stat.detail}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Chart row ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Donut — larger, more weight */}
        <div className="relative rounded-2xl border p-5 dashboard-reveal"
          style={{ background:C.card, borderColor:C.border, boxShadow:cardShadow, animationDelay:"440ms",
            zIndex:isSignatureMenuOpen?30:undefined }}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color:C.muted }}>Signature Status Breakdown</p>
            <div className="relative" ref={signatureMenuRef}>
              <button type="button"
                aria-label={`Filter signature status by signatory${selectedSignature?`: ${selectedSignature}`:""}`}
                aria-haspopup="listbox" aria-expanded={isSignatureMenuOpen}
                onClick={()=>{ setIsEntryPeriodMenuOpen(false); setIsSignatureMenuOpen(open=>!open); }}
                className="flex max-w-[190px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-blue-500"
                style={{ background:C.card2, borderColor:C.border, color:C.sub }}>
                <span className="truncate">{selectedSignature??"All"}</span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 flex-shrink-0"/>
              </button>
              {isSignatureMenuOpen&&(
                <div role="listbox" aria-label="Filter signature status by signatory"
                  className="absolute right-0 top-full z-20 mt-2 max-h-56 w-60 overflow-y-auto rounded-md border py-1 shadow-lg"
                  style={{ background:C.card, borderColor:C.border }}>
                  {[{ value:null as string|null, label:"All" },...signatureOptions.map(signature=>({ value:signature,label:signature }))].map(option=>(
                    <button key={option.value??"all"} type="button" role="option"
                      aria-selected={selectedSignature===option.value}
                      onClick={()=>{ setSelectedSignature(option.value); setIsSignatureMenuOpen(false); }}
                      className="w-full px-3 py-2 text-left text-xs transition-colors hover:brightness-95"
                      style={{ background:selectedSignature===option.value?C.card2:C.card, color:C.sub }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0" style={{ width:130, height:130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} cx="50%" cy="50%" innerRadius={38} outerRadius={60}
                    isAnimationActive animationDuration={1700} animationBegin={360} dataKey="value" strokeWidth={2}
                    stroke={isDark?"#141827":"#FFFFFF"}>
                    {donut.map(d=><Cell key={`dc-${d.name}`} fill={d.color}/>)}
                  </Pie>
                  <Tooltip content={<ChartTip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                <span className="text-2xl font-extrabold" style={{ color:C.text }}>{total}</span>
                <span style={{ fontSize:9, color:C.muted, letterSpacing:"0.05em" }}>TOTAL TODAY</span>
              </div>
            </div>
            <div className="flex-1 space-y-2.5">
              {donut.map(d=>(
                <div key={`dl-${d.name}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background:d.color }}/>
                      <span style={{ fontSize:10, color:C.sub }}>{d.name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color:C.text }}>{d.value}</span>
                  </div>
                  <div style={{ height:4, borderRadius:3, background:isDark?"rgba(255,255,255,0.06)":"#E9EBF3" }}>
                    <div style={{ height:"100%", borderRadius:3, width:`${(d.value/Math.max(total,1))*100}%`,
                      background:`linear-gradient(90deg,${d.color}88,${d.color})` }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* By Signatory */}
        <div className="rounded-2xl border p-5 dashboard-reveal" style={{ background:C.card, borderColor:C.border, boxShadow:cardShadow, animationDelay:"520ms" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color:C.muted }}>By Signatory</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={sigBars} layout="vertical" margin={{ top:0, right:32, left:0, bottom:0 }}>
              <XAxis type="number" hide/>
              <YAxis type="category" dataKey="name" width={130}
                tick={{ fontSize:10, fill:C.sub }} tickLine={false} axisLine={false}/>
              <Bar dataKey="sigCount" radius={[0,5,5,0]} isAnimationActive animationDuration={1800} animationBegin={520}>
                {sigBars.map((_,i)=>(
                  <Cell key={`sc-${i}`} fill={["#6C4FF5","#3B82F6","#8B5CF6","#A78BFA"][i%4]}/>
                ))}
                <LabelList dataKey="sigCount" position="right" style={{ fontSize:10, fill:C.text, fontWeight:700 }}/>
              </Bar>
              <Tooltip content={<ChartTip/>} cursor={{ fill:"rgba(0,0,0,0.03)" }}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Type — each bar a distinct color */}
        <div className="rounded-2xl border p-5 dashboard-reveal" style={{ background:C.card, borderColor:C.border, boxShadow:cardShadow, animationDelay:"600ms" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color:C.muted }}>By Document Type</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={typeBars} margin={{ top:16, right:8, left:-20, bottom:0 }}>
              <CartesianGrid vertical={false} stroke={C.border}/>
              <XAxis dataKey="name" tick={{ fontSize:12, fill:C.sub, fontWeight:600 }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fontSize:10, fill:C.muted }} tickLine={false} axisLine={false}/>
              <Bar dataKey="typeCount" radius={[5,5,0,0]} isAnimationActive animationDuration={1800} animationBegin={640}>
                {typeBars.map((d,i)=>(
                  <Cell key={`tc-${i}`} fill={d.fill}/>
                ))}
                <LabelList dataKey="typeCount" position="top" style={{ fontSize:11, fontWeight:700, fill:C.text }}/>
              </Bar>
              <Tooltip content={<ChartTip/>} cursor={{ fill:"rgba(0,0,0,0.03)" }}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Bottleneck analytics (full width) ── */}
        <div className="dashboard-reveal" style={{ animationDelay:"700ms" }}><BottleneckCard trackingRecords={trackingRecords}/></div>

      {/* ── Document tables ── */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { title:"For Signature (Today)", rows:forSig },
          { title:"Recently Completed (Today)", rows:completed },
        ].map(({ title, rows })=>(
          <div key={title} className="rounded-2xl border overflow-hidden dashboard-reveal"
            style={{ background:C.card, borderColor:C.border, boxShadow:cardShadow, animationDelay:"780ms" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor:C.border }}>
              <span className="text-xs font-bold" style={{ color:C.text }}>{title}</span>
              <button onClick={()=>setScreen("document-tracker")} className="text-xs font-semibold"
                style={{ color:C.purple }}>View All →</button>
            </div>
            <div style={{ background:LT.rowBg }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background:LT.headerBg }}>
                    {["Control No.","Type","Office","Signatory","Forwarded","Status"].map(h=>(
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold whitespace-nowrap"
                        style={{ color:LT.headerText, borderBottom:"2px solid rgba(108,79,245,0.4)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,5).map((doc,i)=>(
                    <tr key={doc.id}
                      style={{ background:i%2===0?LT.rowBg:LT.rowAltBg, borderBottom:`1px solid ${LT.rowBorder}` }}
                      onMouseEnter={e=>(e.currentTarget.style.background="#EEF2FF")}
                      onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?LT.rowBg:LT.rowAltBg)}
                      onClick={()=>setScreen("document-tracker")}
                      className="cursor-pointer">
                      <td className="px-3 py-2 text-xs font-bold" style={{ color:LT.link }}>#{doc.id}</td>
                      <td className="px-3 py-2 text-xs font-semibold" style={{ color:LT.text }}>{doc.type}</td>
                      <td className="px-3 py-2 text-xs" style={{ color:LT.sub }}>{doc.office}</td>
                      <td className="px-3 py-2 text-xs" style={{ color:LT.sub }}>{doc.signature.split(" – ")[0]}</td>
                      <td className="px-3 py-2 text-xs font-mono" style={{ color:LT.muted, fontSize:10 }}>{doc.dateForwarded}</td>
                      <td className="px-3 py-2"><StatusBadge status={doc.status}/></td>
                    </tr>
                  ))}
                  {rows.length===0&&(
                    <tr><td colSpan={6} className="py-8 text-center text-xs"
                      style={{ background:LT.rowBg, color:LT.muted }}>No documents.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ background:C.card }}>
              <Pagination total={rows.length} shown={Math.min(5,rows.length)}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DOC ENTRY MODAL ─────────────────────────────────────────────────────────

function DocEntryModal({ nextId, catalog, userId, onClose, onSave }:{
  nextId:string; catalog:CatalogData; userId:number; onClose:()=>void; onSave:(doc:DocRecord)=>void;
}) {
  const C=useC();
  const [type,setType]=useState(catalog.types[0]??"");
  const [office,setOffice]=useState(""), [vendor,setVendor]=useState("");
  const [parts,setParts]=useState(""), [fund,setFund]=useState("");
  const [amount,setAmount]=useState(""), [sig,setSig]=useState("");
  const [saved,setSaved]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saveError,setSaveError]=useState("");
  const nowDate=new Date(), nowFmt=fmtDateTimeDisplay(nowDate);
  const today=systemDateKey(nowDate);
  const ok=type&&office&&vendor&&parts&&fund&&amount&&sig;
  const buildDoc=():DocRecord=>({
    id:nextId, date:today, createdAt:nowTs(), type, office, payrollVoucher:vendor, particulars:parts,
    fund, amount:parseFloat(amount)||0, signature:sig, dateForwarded:"", status:"For Signature",
  });
  const reset=()=>{ setType(catalog.types[0]??""); setOffice(""); setVendor(""); setParts(""); setFund(""); setAmount(""); setSig(""); setSaved(false); };

  const persistDocument=async(addAnother:boolean)=>{
    setLoading(true);
    setSaveError("");
    try {
      const doc=buildDoc();
      const res=await fetch('/api/docs-crud.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          control_no:doc.id,
          date_entered:doc.date,
          type:doc.type,
          office:doc.office,
          payroll_voucher:doc.payrollVoucher,
          particulars:doc.particulars,
          fund:doc.fund,
          amount:doc.amount,
          signature:doc.signature,
          date_forwarded:null,
          status:doc.status,
          user_id:userId,
        }),
      });
      const result=await res.json().catch(()=>null);
      if(!res.ok||!result?.success){
        throw new Error(result?.message||`Failed to save document (${res.status}).`);
      }
      onSave({...doc,createdAt:result.created_at??doc.createdAt});
      if(addAnother){ reset(); setSaved(true); }
      else onClose();
    }catch(e){
      console.error('Save error',e);
      setSaveError(e instanceof Error?e.message:"Error saving document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} wide>
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-bold" style={{ color:C.text }}>+ Add New Document</div>
        {saved&&<span className="text-sm px-2 py-0.5 rounded-full font-semibold"
          style={{ background:"rgba(16,185,129,0.15)", color:C.green }}>✓ Saved — enter next</span>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field size="large" label="Control Number (auto)"><TInput size="large" value={nextId} readOnly/></Field>
        <Field size="large" label="Date & Time (auto)"><TInput size="large" value={nowFmt} readOnly/></Field>
        <Field size="large" label="Type"><TSelect size="large" options={catalog.types} value={type} onChange={v=>{setType(v as any);setSaved(false);}}/></Field>
        <Field size="large" label="Office"><TSelect size="large" options={catalog.offices} value={office} onChange={v=>{setOffice(v);setSaved(false);}}/></Field>
        <Field size="large" label="Payroll / Voucher"><TInput size="large" placeholder="Enter payroll or voucher reference" value={vendor} onChange={v=>{setVendor(v);setSaved(false);}}/></Field>
        <Field size="large" label="Particular / Details"><TInput size="large" placeholder="Enter particulars or details" value={parts} onChange={v=>{setParts(v);setSaved(false);}}/></Field>
        <Field size="large" label="Fund"><TSelect size="large" options={catalog.funds} value={fund} onChange={v=>{setFund(v);setSaved(false);}}/></Field>
        <Field size="large" label="Amount"><TInput size="large" type="number" placeholder="0.00" value={amount} onChange={v=>{setAmount(v);setSaved(false);}}/></Field>
        <Field size="large" label="Signature"><TSelect size="large" options={catalog.signatures} value={sig} onChange={v=>{setSig(v);setSaved(false);}}/></Field>
      </div>
      {saveError&&<p role="alert" className="text-sm mt-3" style={{ color:C.red }}>{saveError}</p>}
      <div className="flex gap-3 mt-5 pt-4" style={{ borderTop:`1px solid ${C.border}` }}>
        <Btn size="large" disabled={!ok||loading} onClick={()=>void persistDocument(false)}>{loading?'Saving...':'Save'}</Btn>
        <button disabled={!ok||loading} onClick={()=>void persistDocument(true)}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{ background:"rgba(108,79,245,0.12)", color:C.purple, border:`1px solid ${C.purple}55` }}>
          {loading?'Saving...':'Save & Add New'}
        </button>
        <Btn size="large" variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </ModalOverlay>
  );
}

// ─── DOC EDIT MODAL ───────────────────────────────────────────────────────────

function DocEditModal({ doc, catalog, userId, onClose, onSave, onQrGenerate, onViewTracking, forwardActor, canRoute=false, detailsUnlocked=false, isGroupDocument=false, firstReturnAt }:{
  doc:DocRecord; catalog:CatalogData; userId:number; onClose:()=>void; onSave:(d:DocRecord,forwardOffice?:string)=>void; onQrGenerate?:(id:string)=>void;
  onViewTracking?: (id:string)=>void; forwardActor?:string; canRoute?:boolean; detailsUnlocked?:boolean; isGroupDocument?:boolean; firstReturnAt?:string;
}) {
  const C=useC();
  const officeOptions = catalog.offices;
  const fundOptions = catalog.funds;
  const typeOptions = catalog.types;
  const signatureOptions = catalog.signatures;
  const [e,setE]=useState(()=>({...doc,dateReturned:doc.dateReturned||firstReturnAt}));
  const [qrDone,setQr]=useState(doc.qrGenerated??false);
  const [loading,setLoading]=useState(false);
  const [saveError,setSaveError]=useState("");
  const [forwardOffice,setForwardOffice]=useState("");
  const up=<K extends keyof DocRecord>(k:K,v:DocRecord[K])=>{
    setE(p=>({...p,[k]:v}));
    setSaveError("");
  };
  const selectForwardOffice=(office:string)=>{
    setForwardOffice(office);
  };
  
  const handleSave=async()=>{
    setLoading(true);
    setSaveError("");
    try {
      if (forwardOffice&&forwardOffice!=="PRC"&&!forwardActor) {
        throw new Error("Add your 11-digit contact number in your profile before forwarding this document.");
      }
      if (forwardOffice==="PRC"&&(!e.processorName?.trim()||!e.processorContactNumber?.trim())) {
        throw new Error("Enter the processor's complete name and 11-digit contact number before forwarding.");
      }
      const processorName=forwardOffice==="PRC"?e.processorName?.trim()??"":doc.processorName??"";
      const processorContactNumber=forwardOffice==="PRC"
        ?e.processorContactNumber?.trim()??""
        :doc.processorContactNumber??"";
      const res=await fetch('/api/docs-crud.php',{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          id:doc.id,
          type:e.type,
          sub_type:e.subType??'',
          office:e.office,
          payroll_voucher:e.payrollVoucher,
          signature:e.signature,
          particulars:e.particulars,
          fund:e.fund,
          amount:e.amount,
          cheque_no:e.chequeNo??'',
          pr_number:e.prNumber??'',
          date_returned:forwardOffice&&forwardOffice!=="PRC"?null:(e.dateReturned??null),
          processor_name:processorName,
          processor_contact_number:processorContactNumber,
          forward_to_processors:forwardOffice==="PRC",
          qr_generated:qrDone||!!e.qrGenerated,
          user_id:userId,
        }),
      });
      const updatePayload=await res.json().catch(()=>null);
      if(!res.ok||!updatePayload?.success){
        throw new Error(updatePayload?.message??`Document update failed (${res.status})`);
      }
      const dateForwarded=updatePayload.dateForwarded??e.dateForwarded;
      let forwardWasNew=false;
      if (forwardOffice&&forwardOffice!=="PRC") {
        const response=await fetch('/api/tracking-update',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({controlNo:doc.id,office:"CA",action:"dispatch",forwardedTo:forwardOffice,actor:forwardActor}),
        });
        const payload=await response.json().catch(()=>null);
        if (!response.ok||!payload?.success) {
          throw new Error(payload?.message??`Office forwarding failed (${response.status})`);
        }
        forwardWasNew=!payload.idempotent;
      }
      const wasForwarded=!!forwardOffice;
      onSave({...e,processorName,processorContactNumber,qrGenerated:qrDone||!!e.qrGenerated,dateForwarded,status:wasForwarded?"Completed":doc.status},
        forwardWasNew?forwardOffice:undefined);
      onClose();
    }catch(err){
      console.error('Update error',err);
      setSaveError(err instanceof Error?err.message:'Unable to save the document changes.');
    }finally{
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @media print {
          body * { display: none !important; }
          .qr-print-only, .qr-print-only * { display: block !important; visibility: visible !important; }
          .qr-print-only {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: #ffffff !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 2147483647 !important;
          }
          .qr-print-card {
            width: 280px !important;
            max-width: 100% !important;
            border: 1px solid rgba(15, 23, 42, 0.15) !important;
            border-radius: 18px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            padding: 18px 20px 16px !important;
            text-align: center !important;
          }
          .qr-print-card .print-hide { display: none !important; }
          .modal-backdrop-enter { background: transparent !important; }
          .modal-panel-enter { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {!isGroupDocument&&<div className="qr-print-only" aria-hidden="true" style={{ display: "none" }}>
        <div className="qr-print-card">
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: "#1f2937" }}>
            ADTRAQS
          </div>
          <div className="flex items-center justify-center mb-3" style={{ background: "#fff" }}>
            <QRCodeSVG
              value={getProcessorDocumentUrl(doc.id)}
              size={130}
              bgColor="#ffffff"
              fgColor="#0D1021"
            />
          </div>
          <div className="text-[11px] font-semibold" style={{ color: "#374151" }}>
            Control No. #{doc.id}
          </div>
        </div>
      </div>}

      <ModalOverlay onClose={onClose} wide>
        <div className="text-sm font-bold mb-4" style={{ color:C.text }}>✎ Edit Document — #{doc.id}</div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Control Number"><TInput value={e.id} readOnly /></Field>
          <Field label="Date"><TInput value={e.date} readOnly /></Field>
          <Field label="Type"><TSelect options={typeOptions} value={e.type} onChange={v => up("type", v as any)} /></Field>
          <Field label="Office"><TSelect options={officeOptions} value={e.office} onChange={v => up("office", v)} /></Field>
          <Field label="Payroll / Voucher"><TInput placeholder="Enter payroll or voucher" value={e.payrollVoucher} onChange={v => up("payrollVoucher", v)} /></Field>
          <Field label="Particular / Details"><TInput placeholder="Enter particulars" value={e.particulars} onChange={v => up("particulars", v)} /></Field>
          <Field label="Fund"><TSelect options={fundOptions} value={e.fund} onChange={v => up("fund", v)} /></Field>
          <Field label="Amount"><TInput type="number" value={String(e.amount)} onChange={v => up("amount", parseFloat(v) || 0)} /></Field>
          <Field label="Signature"><TSelect options={signatureOptions} value={e.signature} onChange={v => up("signature", v)} /></Field>
          {detailsUnlocked&&<>
            <Field label="Cheque No."><TInput type="text" placeholder="Bank cheque number" value={e.chequeNo ?? ""} onChange={v => up("chequeNo", v.replace(/\D/g,""))} /></Field>
            <Field label="Type (Secondary)"><TInput placeholder="Secondary classification" value={e.subType ?? ""} onChange={v => up("subType", v)} /></Field>
            <Field label="P.R. Number"><TInput placeholder="Purchase request number" value={e.prNumber ?? ""} onChange={v => up("prNumber", v)} /></Field>
          </>}
          {canRoute&&detailsUnlocked&&e.dateForwarded&&!e.dateForwarded.startsWith("0000-")&&<Field label="Date Forwarded"><TInput value={fmtLocalDateTime(e.dateForwarded)} readOnly /></Field>}
          {detailsUnlocked&&<Field label="Date Fwd. (Returned) - auto"><TInput value={e.dateReturned?fmtLocalDateTime(e.dateReturned):""} readOnly /></Field>}
          {canRoute&&!isGroupDocument&&!detailsUnlocked&&<Field label="Forward to office">
            <TSelect options={["CTO","CBO","CAO","PRC"]} optionLabels={OFFICE_DISPLAY_NAME}
              value={forwardOffice} onChange={selectForwardOffice} placeholder="Save without forwarding"/>
          </Field>}
        </div>

        {forwardOffice==="PRC"&&(
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border p-4"
            style={{ borderColor:C.border, background:C.card2 }}>
            <div className="col-span-2">
              <p className="text-xs font-semibold" style={{ color:C.text }}>Processor details</p>
              <p className="mt-1 text-xs" style={{ color:C.muted }}>
                Enter the processor carrying this document. This saves the details without assigning an office.
              </p>
            </div>
            <Field label="Complete name">
              <TInput value={e.processorName??""} onChange={value=>up("processorName",value)}/>
            </Field>
            <Field label="Contact number">
              <TInput type="tel" value={e.processorContactNumber??""}
                onChange={value=>up("processorContactNumber",value.replace(/\D/g,"").slice(0,11))}/>
            </Field>
          </div>
        )}

        {!isGroupDocument&&<div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <p className="text-xs font-semibold mb-3" style={{ color:C.sub }}>QR Code Label</p>
          {!qrDone ? (
            <button
              onClick={() => {
                setQr(true);
                up("qrGenerated", true);
                onQrGenerate?.(doc.id);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border"
              style={{ background:"rgba(108,79,245,0.10)", color:C.purple, borderColor:`${C.purple}44` }}
            >
              ⊞ Generate QR Code
            </button>
          ) : (
            <div className="flex items-start gap-5">
              <div className="p-3 rounded-xl" style={{ background:"#fff" }}>
                <QRCodeSVG
                  id="print-label-qr"
                  value={getProcessorDocumentUrl(doc.id)}
                  size={100}
                  bgColor="#ffffff"
                  fgColor="#0D1021"
                />
              </div>
              <div className="flex-1 pt-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background:"rgba(16,185,129,0.15)", color:C.green }}>
                  ✓ QR Code Generated
                </span>
                <p className="text-xs mt-2 mb-3" style={{ color:C.muted }}>
                  Control No. #{doc.id} · One QR per document.
                </p>
                <button
                  onClick={() => {
                    const qrSvg = document.getElementById('print-label-qr');
                    const printWindow = window.open('', '_blank', 'width=500,height=500');
                    if (!printWindow) {
                      alert('Please allow pop-ups to print the QR label.');
                      return;
                    }

                    const svgMarkup = qrSvg ? qrSvg.outerHTML : '';
                    printWindow.document.write(`<!doctype html>
                      <html>
                        <head>
                          <title>ADTRAQS QR Label</title>
                          <style>
                            html, body {
                              margin: 0;
                              height: 100%;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              font-family: Arial, sans-serif;
                              background: #ffffff;
                            }
                            .label {
                              width: 260px;
                              border: 1px solid #d1d5db;
                              border-radius: 18px;
                              padding: 16px 18px 14px;
                              background: #ffffff;
                              text-align: center;
                              box-sizing: border-box;
                            }
                            .brand {
                              font-size: 11px;
                              font-weight: 700;
                              letter-spacing: 0.18em;
                              text-transform: uppercase;
                              color: #1f2937;
                              margin-bottom: 8px;
                            }
                            .qr-wrap {
                              display: flex;
                              justify-content: center;
                              margin-bottom: 10px;
                            }
                            .qr-wrap svg {
                              width: 150px !important;
                              height: 150px !important;
                              display: block;
                            }
                            .control {
                              font-size: 11px;
                              font-weight: 600;
                              color: #374151;
                              letter-spacing: 0.02em;
                            }
                          </style>
                        </head>
                        <body>
                          <div class="label">
                            <div class="brand">ADTRAQS</div>
                            <div class="qr-wrap">${svgMarkup}</div>
                            <div class="control">Control No. #${doc.id}</div>
                          </div>
                        </body>
                      </html>`);
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => printWindow.print(), 300);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ borderColor:C.border, color:C.sub, background:C.card2 }}
                >
                  🖨 Print QR Label
                </button>
              </div>
            </div>
          )}
        </div>}

        {saveError&&<p role="alert" className="mt-4 text-xs font-medium" style={{ color:C.red }}>{saveError}</p>}

        <div className="flex items-center gap-3 mt-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
          {onViewTracking&&(
            <button onClick={()=>onViewTracking(doc.id)}
              className="px-4 py-2 rounded-lg text-xs font-semibold border"
              style={{ borderColor:C.blue, color:C.blue, background:`${C.blue}12` }}>
              View Tracking Details
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <Btn disabled={loading} onClick={handleSave}>{loading ? 'Saving...' : 'Save Changes'}</Btn>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      </ModalOverlay>
    </>
  );
}

// ─── DOCUMENT TRACKER ─────────────────────────────────────────────────────────

function DocumentTracker({ role, user, docs, trackingRecords, groupTrackingRecords, catalog, setDocs, setTracking, setGroupTrackingRecords, openDocumentId, onOpenDocumentHandled, onViewTracking }:{
  role:Role; docs:DocRecord[]; trackingRecords:TrackingRecord[]; catalog:CatalogData; setDocs:React.Dispatch<React.SetStateAction<DocRecord[]>>;
  groupTrackingRecords:GroupTrackingRecord[]; setGroupTrackingRecords:React.Dispatch<React.SetStateAction<GroupTrackingRecord[]>>;
  user:AuthUser|null;
  setTracking:React.Dispatch<React.SetStateAction<TrackingRecord[]>>; openDocumentId?:string;
  onOpenDocumentHandled?:()=>void; onViewTracking?:(id:string)=>void;
}) {
  const C=useC();
  const { theme }=useTheme();
  const isDark=theme==="dark";
  const [showEntry,setShowEntry]=useState(false), [editDoc,setEditDoc]=useState<DocRecord|null>(null);
  const [detailDoc,setDetailDoc]=useState<DocRecord|null>(null);
  const [qrDoc,setQrDoc]=useState<DocRecord|null>(null);
  const [groupQr,setGroupQr]=useState<GroupTrackingRecord|null>(null);
  const [hoveredGroupQrId,setHoveredGroupQrId]=useState<number|null>(null);
  const [selectingDocs,setSelectingDocs]=useState(false), [selectedDocIds,setSelectedDocIds]=useState<string[]>([]);
  const [forwardGroupOffice,setForwardGroupOffice]=useState("");
  const [forwardingGroup,setForwardingGroup]=useState(false);
  const [routeAgainDoc,setRouteAgainDoc]=useState<DocRecord|null>(null);
  const [routeAgainOffice,setRouteAgainOffice]=useState("");
  const [routeAgainGroup,setRouteAgainGroup]=useState<GroupTrackingRecord|null>(null);
  const [routeAgainGroupOffice,setRouteAgainGroupOffice]=useState("");
  const [routeAgainLoading,setRouteAgainLoading]=useState(false);
  const [receivingControlNo,setReceivingControlNo]=useState<string|null>(null);
  const [fOffice,setFOffice]=useState(""), [fType,setFType]=useState(""), [fSignature,setFSignature]=useState("");
  const [search,setSearch]=useState("");
  const actor=getTrackingActor(user);
  const nextId=String(docs.reduce((max,doc)=>{
    const id=Number(doc.id);
    return Number.isSafeInteger(id)?Math.max(max,id):max;
  },0)+1).padStart(7,"0");

  useEffect(()=>{
    if (!openDocumentId) return;
    const target=docs.find(doc=>doc.id===openDocumentId);
    if (!target) return;
    if (role==="admin") setDetailDoc(target);
    else if (canEditDoc(target)) setEditDoc(target);
    onOpenDocumentHandled?.();
  },[docs,openDocumentId,onOpenDocumentHandled,role]);

  const LT=isDark
    ? { headerBg:C.sidebar, headerText:C.text, rowBg:C.card, rowAltBg:C.card2, rowBorder:C.border,
        text:C.text, sub:C.sub, muted:C.muted, link:C.purple }
    : { headerBg:"#0D1021", headerText:"#FFFFFF", rowBg:"#FFFFFF", rowAltBg:"#F7F8FC", rowBorder:"#E2E8F0",
        text:"#1A2035", sub:"#111827", muted:"#111827", link:"#6C4FF5" };

  const handleQr=(id:string)=>setDocs(p=>p.map(d=>d.id===id?{...d,qrGenerated:true}:d));
  const hasCityAdminReceipt=(doc:DocRecord)=>{
    const record=trackingRecords.find(item=>item.controlNo===doc.id);
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    return (!!record&&(!!record.caReturn?.received||!!record.visits?.some(visit=>visit.office==="CA"&&!!visit.received)))||
      (!!group&&(!!group.caReturn?.received||!!group.visits?.some(visit=>visit.office==="CA"&&!!visit.received)));
  };
  const canEditDoc=(doc:DocRecord)=>{
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    if (group) {
      const position=getCurrentPosition(group);
      return (position.office==="CA"&&position.stage==="Received")||
        (position.office==="Complete"&&!!getForwardedTimestamp(doc));
    }
    const record=trackingRecords.find(item=>item.controlNo===doc.id);
    if (!record) return true;
    const position=getCurrentPosition(record);
    return (position.office==="CA"&&position.stage==="Received")||
      (position.office==="Complete"&&!!getForwardedTimestamp(doc));
  };
  const getOfficeForwardInfo=(doc:DocRecord)=>{
    const trackingRecord=trackingRecords.find(item=>item.controlNo===doc.id);
    const visits=trackingRecord?.visits??[];
    const getProcessorReceipt=(afterTimestamp?:string)=>{
      const cutoff=afterTimestamp?parseSystemTimestamp(afterTimestamp).getTime():Number.NEGATIVE_INFINITY;
      const visitReceipt=visits.find(visit=>
        ["CTO","CBO","CAO"].includes(visit.office)&&!!visit.received&&
        parseSystemTimestamp(visit.received).getTime()>cutoff
      );
      if (visitReceipt) return visitReceipt;
      const legacyReceipts=(["CTO","CBO","CAO"] as const).flatMap(office=>{
        const received=trackingRecord?.[STEP_KEY[office]]?.received;
        return received&&parseSystemTimestamp(received).getTime()>cutoff
          ?[{office,received}]
          :[];
      });
      return legacyReceipts.sort((left,right)=>
        parseSystemTimestamp(left.received).getTime()-parseSystemTimestamp(right.received).getTime()
      )[0];
    };
    const latestRoute=visits.filter(visit=>visit.forwardedTo).at(-1);
    if (!latestRoute?.forwardedTo) {
      const processorReceipt=doc.processorName?.trim()&&doc.processorContactNumber?.trim()
        ?getProcessorReceipt()
        :undefined;
      return {
        label:processorReceipt?`Forwarded · ${processorReceipt.office}`
          :doc.processorName?.trim()&&doc.processorContactNumber?.trim()?"Forwarded · PRC":"",
        returnedOffice:null,
        received:false,
      };
    }
    if (latestRoute.forwardedTo==="PRC") {
      const routeIndex=visits.lastIndexOf(latestRoute);
      const firstOfficeReceipt=visits.slice(routeIndex+1).find(visit=>
        ["CTO","CBO","CAO"].includes(visit.office)&&!!visit.received,
      )??getProcessorReceipt(latestRoute.forwarded);
      return {
        label:`Forwarded · ${firstOfficeReceipt?.office??"PRC"}`,
        returnedOffice:null,
        received:!!firstOfficeReceipt,
      };
    }
    if (latestRoute.forwardedTo!=="CA") {
      return { label:`Forwarded · ${latestRoute.forwardedTo}`, returnedOffice:null, received:false };
    }
    const routeIndex=visits.indexOf(latestRoute);
    const received=visits.slice(routeIndex+1).some(visit=>visit.office==="CA"&&!!visit.received);
    return {
      label:received?`Received · ${latestRoute.office}`:`Returned · ${latestRoute.office}`,
      returnedOffice:latestRoute.office,
      received,
    };
  };
  const getGroupReturnInfo=(group:GroupTrackingRecord)=>{
    const visits=group.visits??[];
    const latestRoute=visits.filter(visit=>visit.forwardedTo==="CA"&&!!visit.forwarded).at(-1);
    if (!latestRoute) return { returnedOffice:null, received:false };
    const routeIndex=visits.lastIndexOf(latestRoute);
    const received=visits.slice(routeIndex+1).some(visit=>visit.office==="CA"&&!!visit.received);
    return { returnedOffice:received?null:latestRoute.office, received };
  };
  const getForwardedTimestamp=(doc:DocRecord)=>{
    const record=trackingRecords.find(item=>item.controlNo===doc.id);
    const visits=record?.visits??[];
    const firstDispatch=visits.find(visit=>visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded);
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    const groupDispatch=group?.visits?.find(visit=>
      visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded
    );
    const savedTimestamp=doc.dateForwarded&&!doc.dateForwarded.startsWith("0000-")?doc.dateForwarded:"";
    return firstDispatch?.forwarded??groupDispatch?.forwarded??savedTimestamp;
  };
  const isSelectableForGroupForward=(doc:DocRecord)=>{
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    const trackingRecord=trackingRecords.find(record=>record.controlNo===doc.id);
    if (group||trackingRecord?.completedAt||getForwardedTimestamp(doc)||
        trackingRecord?.visits?.some(visit=>visit.office==="CA"&&!!visit.forwarded)) return false;
    if (!trackingRecord) return true;
    const position=getCurrentPosition(trackingRecord);
    return position.office==="CA"&&position.stage==="Received";
  };
  const getReturnedTimestamp=(doc:DocRecord)=>{
    const visits=trackingRecords.find(item=>item.controlNo===doc.id)?.visits??[];
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    const groupVisits=group?.visits??[];
    const returnReceipt=(journey:OfficeVisit[])=>{
      const route=journey.find(visit=>visit.forwardedTo==="CA"&&!!visit.forwarded);
      if (!route) return undefined;
      return journey.slice(journey.lastIndexOf(route)+1).find(visit=>visit.office==="CA"&&!!visit.received);
    };
    const receipt=group?returnReceipt(groupVisits):returnReceipt(visits);
    return receipt?.received??(doc.dateReturned&&!doc.dateReturned.startsWith("0000-")?doc.dateReturned:"");
  };
  const getFirstGroupReturnTimestamp=(doc:DocRecord)=>{
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    if (!group) return undefined;
    const visits=group.visits??[];
    const firstReturnRoute=visits.find(visit=>visit.forwardedTo==="CA"&&!!visit.forwarded);
    if (!firstReturnRoute) return undefined;
    return visits.slice(visits.indexOf(firstReturnRoute)+1)
      .find(visit=>visit.office==="CA"&&!!visit.received)?.received;
  };
  const forwardSelectedGroup=async()=>{
    if (!user||!forwardGroupOffice||selectedDocIds.length===0) return;
    if (!actor) {
      alert("Add your 11-digit contact number in your profile before forwarding documents.");
      return;
    }
    const ids=[...selectedDocIds].sort();
    const numbers=ids.map(Number);
    if (numbers.some((number,index)=>index>0&&number!==numbers[index-1]+1)) {
      alert("Select consecutive control numbers so the SET QR range identifies exactly the selected documents.");
      return;
    }
    setForwardingGroup(true);
    try {
      const response=await fetch('/api/group-forward.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({controlNos:ids,forwardedTo:forwardGroupOffice,actor,userId:user.id}),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Grouped forwarding failed (${response.status})`);
      }
      const groupId=Number(payload.groupId);
      if (!Number.isSafeInteger(groupId)||typeof payload.controlRange!=="string") {
        throw new Error("The server created the group, but returned incomplete tracking details. Refresh the page before forwarding again.");
      }
      const forwardedAt=payload.forwardedAt??nowTs();
      const memberDocs=docs.filter(doc=>ids.includes(doc.id)).map(doc=>({
        ...doc,dateForwarded:doc.dateForwarded??forwardedAt,status:"Completed" as const,
      }));
      const group:GroupTrackingRecord={
        id:`G${String(groupId).padStart(3,"0")}`,
        groupId,
        controlNo:payload.controlRange,
        startControlNo:ids[0],
        endControlNo:ids[ids.length-1],
        particulars:`${memberDocs.length} grouped documents`,
        type:memberDocs.length===1?memberDocs[0].type:"GROUP",
        initiatedAt:forwardedAt,
        visits:[{office:"CA",forwarded:forwardedAt,forwardedTo:forwardGroupOffice,forwardedBy:actor}],
        documents:memberDocs,
      };
      setGroupTrackingRecords(current=>[group,...current.filter(item=>item.groupId!==group.groupId)]);
      setDocs(current=>current.map(doc=>ids.includes(doc.id)
        ?{...doc,dateForwarded:doc.dateForwarded??forwardedAt,status:"Completed"}
        :doc));
      setSelectedDocIds([]);
      setSelectingDocs(false);
      setForwardGroupOffice("");
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to forward the selected documents.");
    } finally {
      setForwardingGroup(false);
    }
  };
  const handleReceiveReturned=async(doc:DocRecord)=>{
    const route=getOfficeForwardInfo(doc);
    if (!route.returnedOffice||route.received||receivingControlNo) return;
    setReceivingControlNo(doc.id);
    try {
      const response=await fetch('/api/tracking-update.php',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({controlNo:doc.id,office:"CA",action:"receive",actor:actor||"Staff Member"}),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Receipt failed (${response.status})`);
      }
      const receivedAt=payload.updatedAt??nowTs();
      setTracking(current=>current.map(record=>record.controlNo===doc.id
        ?{...record,visits:[...(record.visits??[]),{office:"CA",received:receivedAt,receivedBy:actor||"Staff Member"}]}
        :record));
      setDocs(current=>current.map(item=>item.id===doc.id
        ?{...item,dateReturned:item.dateReturned&&!item.dateReturned.startsWith("0000-")?item.dateReturned:receivedAt}
        :item));
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to receive the returned document.");
    } finally {
      setReceivingControlNo(null);
    }
  };
  const handleReceiveReturnedGroup=async(group:GroupTrackingRecord)=>{
    const route=getGroupReturnInfo(group);
    if (!route.returnedOffice||route.received||receivingControlNo) return;
    const controlNo=group.startControlNo;
    setReceivingControlNo(controlNo);
    try {
      const response=await fetch('/api/group-tracking-update.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({groupId:group.groupId,office:"CA",action:"receive",actor:actor||"Staff Member"}),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Group receipt failed (${response.status})`);
      }
      const receivedAt=payload.updatedAt??nowTs();
      const receivedBy=actor||"Staff Member";
      setGroupTrackingRecords(current=>current.map(item=>item.groupId===group.groupId
        ?{...item,caReturn:{received:receivedAt,receivedBy},visits:[...(item.visits??[]),{office:"CA",received:receivedAt,receivedBy}]}
        :item));
      const memberIds=new Set(group.documents.map(doc=>doc.id));
      setDocs(current=>current.map(doc=>memberIds.has(doc.id)
        ?{...doc,dateReturned:doc.dateReturned&&!doc.dateReturned.startsWith("0000-")?doc.dateReturned:receivedAt}
        :doc));
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to receive the returned grouped documents.");
    } finally {
      setReceivingControlNo(null);
    }
  };
  const applyOfficeRoute=(doc:DocRecord,office:string,forwardedBy:string)=>{
    const forwardedAt=nowTs();
    const previousVisits=trackingRecords.find(record=>record.controlNo===doc.id)?.visits??[];
    const firstDispatch=previousVisits.find(visit=>visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded);
    const originalForwardedAt=firstDispatch?.forwarded??(getForwardedTimestamp(doc)||forwardedAt);
    setDocs(current=>current.map(item=>item.id===doc.id?{...item,dateForwarded:originalForwardedAt}:item));
    setTracking(current=>{
      const existing=current.find(record=>record.controlNo===doc.id);
      const visits:OfficeVisit[]=existing?.visits?[...existing.visits]:existing?([
        ...(["CTO","CBO","CAO"] as const).flatMap(office=>{
          const step=existing[office.toLowerCase() as JourneyStepKey];
          return step?[{office,...step}]:[];
        }),
        ...(existing.caReturn?[{office:"CA",...existing.caReturn}]:[]),
      ]):[];
      const last=visits[visits.length-1];
      if (last?.office==="CA"&&last.received&&!last.forwarded) {
        visits[visits.length-1]={...last,forwarded:forwardedAt,forwardedTo:office,forwardedBy};
      } else {
        visits.push({office:"CA",forwarded:forwardedAt,forwardedTo:office,forwardedBy});
      }
      const updated:TrackingRecord=existing
        ?{...existing,visits}
        :{id:`T${Date.now()}`,controlNo:doc.id,particulars:doc.particulars,type:doc.type,initiatedAt:forwardedAt,visits};
      return existing?current.map(record=>record.id===existing.id?updated:record):[...current,updated];
    });
  };
  const handleRouteAgain=async()=>{
    if (!routeAgainDoc||!routeAgainOffice) return;
    if (!actor) { alert("Add your 11-digit contact number in your profile before forwarding this document."); return; }
    setRouteAgainLoading(true);
    try {
      const response=await fetch('/api/tracking-update.php',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({controlNo:routeAgainDoc.id,office:"CA",action:"dispatch",forwardedTo:routeAgainOffice,actor}),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Office forwarding failed (${response.status})`);
      }
      if (!payload.idempotent) applyOfficeRoute(routeAgainDoc,routeAgainOffice,actor);
      setRouteAgainDoc(null);
      setRouteAgainOffice("");
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to forward the completed document.");
    } finally {
      setRouteAgainLoading(false);
    }
  };
  const handleGroupRouteAgain=async()=>{
    if (!routeAgainGroup||!routeAgainGroupOffice) return;
    if (!actor) { alert("Add your 11-digit contact number in your profile before forwarding the group."); return; }
    setRouteAgainLoading(true);
    try {
      const response=await fetch('/api/group-tracking-update.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          groupId:routeAgainGroup.groupId,office:"CA",action:"dispatch",
          forwardedTo:routeAgainGroupOffice,actor,
        }),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Group forwarding failed (${response.status})`);
      }
      const trackingResponse=await fetch('/api/group-tracking.php',{cache:'no-store'});
      const trackingPayload=await trackingResponse.json().catch(()=>null);
      if (!trackingResponse.ok||!trackingPayload?.success) {
        throw new Error(trackingPayload?.message??`Group forwarded, but tracking could not be refreshed (${trackingResponse.status})`);
      }
      const updatedGroups:GroupTrackingRecord[]=trackingPayload.groups??[];
      setGroupTrackingRecords(updatedGroups);
      const forwardedAt=payload.updatedAt??nowTs();
      const memberIds=new Set(routeAgainGroup.documents.map(member=>member.id));
      setDocs(current=>current.map(doc=>memberIds.has(doc.id)
        ?{...doc,status:"Completed",dateForwarded:doc.dateForwarded??forwardedAt}
        :doc));
      setRouteAgainGroup(null);
      setRouteAgainGroupOffice("");
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to forward the completed group.");
    } finally {
      setRouteAgainLoading(false);
    }
  };

  const filtered=docs.filter(d=>
    (fOffice===""||d.office===fOffice)&&(fType===""||d.type===fType)&&
    (fSignature===""||d.signature===fSignature)&&
    (search===""||d.id.includes(search)||d.particulars.toLowerCase().includes(search.toLowerCase())||
      d.office.toLowerCase().includes(search.toLowerCase()))
  ).slice().sort((a,b)=>b.id.localeCompare(a.id));
  const selectableFiltered=filtered.filter(doc=>{
    return isSelectableForGroupForward(doc);
  });
  const selectableDocIds=new Set(selectableFiltered.map(doc=>doc.id));

  useEffect(()=>{
    const eligibleIds=new Set(docs.filter(isSelectableForGroupForward).map(doc=>doc.id));
    setSelectedDocIds(current=>{
      const next=current.filter(id=>eligibleIds.has(id));
      return next.length===current.length?current:next;
    });
  },[docs,trackingRecords,groupTrackingRecords]);

  return (
    <div className="p-5">
      {routeAgainDoc&&(
        <ModalOverlay onClose={()=>{setRouteAgainDoc(null);setRouteAgainOffice("");}}>
          <div className="text-sm font-bold mb-1" style={{ color:C.text }}>Continue Office Routing · #{routeAgainDoc.id}</div>
          <p className="text-xs mb-4" style={{ color:C.muted }}>Forward this completed entry to another office using the existing tracking number.</p>
          <Field label="Next office"><TSelect options={["CTO","CBO","CAO"]} optionLabels={OFFICE_DISPLAY_NAME} value={routeAgainOffice} onChange={setRouteAgainOffice}/></Field>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={()=>{setRouteAgainDoc(null);setRouteAgainOffice("");}}>Cancel</Btn>
            <Btn disabled={!routeAgainOffice||routeAgainLoading} onClick={()=>void handleRouteAgain()}>{routeAgainLoading?"Forwarding...":"Forward"}</Btn>
          </div>
        </ModalOverlay>
      )}
      {routeAgainGroup&&(
        <ModalOverlay onClose={()=>{if (!routeAgainLoading){setRouteAgainGroup(null);setRouteAgainGroupOffice("");}}}>
          <div className="text-sm font-bold mb-1" style={{ color:C.text }}>Forward Group Again · #{routeAgainGroup.controlNo}</div>
          <p className="text-xs mb-4" style={{ color:C.muted }}>
            Forward all {routeAgainGroup.documents.length} documents together using their existing set tracking and SET QR code.
          </p>
          <Field label="Next office"><TSelect options={["CTO","CBO","CAO"]} optionLabels={OFFICE_DISPLAY_NAME} value={routeAgainGroupOffice} onChange={setRouteAgainGroupOffice}/></Field>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" disabled={routeAgainLoading} onClick={()=>{setRouteAgainGroup(null);setRouteAgainGroupOffice("");}}>Cancel</Btn>
            <Btn disabled={!routeAgainGroupOffice||routeAgainLoading||!actor} onClick={()=>void handleGroupRouteAgain()}>
              {routeAgainLoading?"Forwarding...":"Forward Group"}
            </Btn>
          </div>
        </ModalOverlay>
      )}
      {forwardGroupOffice&&(
        <ModalOverlay onClose={()=>!forwardingGroup&&setForwardGroupOffice("")}>
          <div className="text-sm font-bold mb-1" style={{ color:C.text }}>Forward Selected Documents</div>
          <p className="text-xs mb-4" style={{ color:C.muted }}>
            {selectedDocIds.length} document{selectedDocIds.length===1?"":"s"} will share one tracking journey and QR code.
          </p>
          <Field label="Forward to">
            <TSelect options={["CTO","CBO","CAO"]} value={forwardGroupOffice} onChange={setForwardGroupOffice}/>
          </Field>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" disabled={forwardingGroup} onClick={()=>setForwardGroupOffice("")}>Cancel</Btn>
            <Btn disabled={!actor||forwardingGroup} onClick={()=>void forwardSelectedGroup()}>
              {forwardingGroup?"Forwarding...":"Forward Group"}
            </Btn>
          </div>
        </ModalOverlay>
      )}
      {showEntry&&user&&<DocEntryModal nextId={nextId} catalog={catalog} userId={user.id} onClose={()=>setShowEntry(false)} onSave={doc=>{
        setDocs(p=>[doc,...p]);
      }}/ >}
      {qrDoc&&<QrPrintModal doc={qrDoc} onClose={()=>setQrDoc(null)}/>}
      {groupQr&&<GroupQrModal group={groupQr} onClose={()=>setGroupQr(null)}/>}
      {editDoc&&user&&<DocEditModal doc={editDoc} catalog={catalog} userId={user.id} canRoute forwardActor={actor}
        detailsUnlocked={hasCityAdminReceipt(editDoc)}
        isGroupDocument={groupTrackingRecords.some(group=>group.documents.some(member=>member.id===editDoc.id))}
        firstReturnAt={getFirstGroupReturnTimestamp(editDoc)}
        onClose={()=>setEditDoc(null)} onQrGenerate={handleQr} onViewTracking={onViewTracking}
        onSave={(u,forwardOffice)=>{
          setDocs(current=>current.map(item=>item.id===u.id?u:item));
          setGroupTrackingRecords(current=>current.map(group=>({
            ...group,
            documents:group.documents.map(member=>member.id===u.id?{...member,...u}:member),
          })));
          if (!forwardOffice) return;
          if (actor) applyOfficeRoute(u,forwardOffice,actor);
        }}/ >}
      {detailDoc&&role==="admin"&&(
        <ModalOverlay onClose={()=>setDetailDoc(null)}>
          <div className="text-sm font-bold mb-4" style={{ color:C.text }}>Document #{detailDoc.id} — Read Only</div>
          <div className="grid grid-cols-2 gap-3">
            {([["Control No.","#"+detailDoc.id],["Date",fmtDate(detailDoc.date)],
              ["Type",detailDoc.type],["Office",detailDoc.office],
              ["Payroll/Voucher",detailDoc.payrollVoucher],["Particulars",detailDoc.particulars],
              ["Fund",detailDoc.fund],["Amount","₱"+detailDoc.amount.toLocaleString()],
              ["Signatory",detailDoc.signature],["Forwarded",detailDoc.dateForwarded],
            ] as [string,string][]).map(([k,v])=>(
              <div key={k} className="rounded-lg p-3" style={{ background:C.card2 }}>
                <div className="text-xs mb-1" style={{ color:C.muted }}>{k}</div>
                <div className="text-xs font-semibold" style={{ color:C.text }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 flex justify-end" style={{ borderTop:`1px solid ${C.border}` }}>
            <Btn variant="ghost" onClick={()=>setDetailDoc(null)}>Close</Btn>
          </div>
        </ModalOverlay>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight" style={{ color:C.text }}>Document Entry</h2>
          {role==="admin"&&<span className="text-xs px-2 py-0.5 rounded"
            style={{ background:"rgba(59,130,246,0.15)", color:C.blue }}>View Only</span>}
        </div>
        {role==="staff"&&<Btn size="large" disabled={!catalog.types.length||!catalog.offices.length||!catalog.funds.length||!catalog.signatures.length}
          onClick={()=>setShowEntry(true)}>+ Add New Document</Btn>}
        {role==="staff"&&(!catalog.types.length||!catalog.offices.length||!catalog.funds.length||!catalog.signatures.length)&&(
          <p className="text-xs" style={{ color:C.muted }}>Document types, offices, funds, and signatories must be configured in the database before adding documents.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 border"
          style={{ background:C.card2, borderColor:C.border }}>
          <span className="text-xs" style={{ color:C.muted }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search…" className="text-sm bg-transparent outline-none w-36"
            style={{ color:C.text }}/>
        </div>
        {[{ label:"Office",val:fOffice,set:setFOffice,opts:catalog.offices },
          { label:"Type",  val:fType,  set:setFType,  opts:catalog.types },
          { label:"Signatory",val:fSignature,set:setFSignature,opts:catalog.signatures }].map(f=>(
          <select key={f.label} value={f.val} onChange={e=>f.set(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-sm border outline-none"
            style={{ background:C.card2, borderColor:C.border, color:f.val?C.text:C.muted }}>
            <option value="">{f.label==="Signatory"?"All Signatories":`All ${f.label}s`}</option>
            {f.opts.map(o=><option key={o}>{o}</option>)}
          </select>
        ))}
        {role==="staff"&&(
          <div className="flex items-center gap-2">
            <Btn size="large" variant={selectingDocs?"ghost":"primary"} onClick={()=>{
              setSelectingDocs(value=>!value);
              setSelectedDocIds([]);
            }}>{selectingDocs?"Cancel selection":"Select docs"}</Btn>
            {selectingDocs&&selectedDocIds.length>0&&(
              <Btn size="large" onClick={()=>setForwardGroupOffice("CTO")}>Forward selected docs ({selectedDocIds.length})</Btn>
            )}
          </div>
        )}
        <span className="text-sm ml-auto" style={{ color:C.muted }}>{filtered.length} records</span>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor:C.border }}>
        <div className="overflow-x-auto" style={{ background:LT.rowBg }}>
          <table className="w-full min-w-max">
            <thead>
              <tr style={{ background:LT.headerBg }}>
                {selectingDocs&&<th className="px-3 py-2.5">
                  <input type="checkbox" aria-label="Select all visible documents"
                    checked={selectableFiltered.length>0&&selectableFiltered.every(doc=>selectedDocIds.includes(doc.id))}
                    onChange={event=>setSelectedDocIds(event.target.checked
                      ?Array.from(new Set([...selectedDocIds,...selectableFiltered.map(doc=>doc.id)]))
                      :selectedDocIds.filter(id=>!selectableFiltered.some(doc=>doc.id===id)))}
                    onClick={event=>event.stopPropagation()}/>
                </th>}
                {["Control No.","Date","Type","Office","Payroll/Voucher","Particular/Details","Fund","Amount","Signature","Date Forwarded","Cheque No.","Date Fwd. (Returned)","Type","P.R. No.",
                  ...(role==="staff"?["QR Generated/Received","Office forward"]:[])].map(h=>(
                  <th key={h} className="text-left px-3 py-2.5 text-[11px] font-bold whitespace-nowrap"
                    style={{ color:LT.headerText, borderBottom:"2px solid rgba(108,79,245,0.4)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc,i)=>{
                const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
                const trackingRecord=trackingRecords.find(item=>item.controlNo===doc.id);
                const isTrackingComplete=!!(group?.completedAt??trackingRecord?.completedAt);
                const visibleGroupDocs=group
                  ?filtered.filter(candidate=>group.documents.some(member=>member.id===candidate.id))
                  :[];
                const firstVisibleGroupMember=visibleGroupDocs[0]?.id===doc.id;
                const groupReturn=group?getGroupReturnInfo(group):null;
                return (
                <tr key={doc.id} className={role==="admin"||(role==="staff"&&canEditDoc(doc))?"cursor-pointer":""}
                  style={{ background:group&&hoveredGroupQrId===group.groupId?"rgba(59,130,246,0.08)":i%2===0?LT.rowBg:LT.rowAltBg, borderBottom:`1px solid ${LT.rowBorder}` }}
                  onMouseEnter={e=>(e.currentTarget.style.background=group&&hoveredGroupQrId===group.groupId?"rgba(59,130,246,0.08)":isDark?C.card2:"#EEF2FF")}
                  onMouseLeave={e=>(e.currentTarget.style.background=group&&hoveredGroupQrId===group.groupId?"rgba(59,130,246,0.08)":i%2===0?LT.rowBg:LT.rowAltBg)}
                  onClick={()=>!selectingDocs&&(role==="admin"?setDetailDoc(doc):role==="staff"&&canEditDoc(doc)&&setEditDoc(doc))}>
                  {selectingDocs&&!group&&selectableDocIds.has(doc.id)&&<td className="px-3 py-2.5" onClick={event=>event.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select document ${doc.id}`}
                      checked={selectedDocIds.includes(doc.id)}
                      onChange={event=>setSelectedDocIds(current=>event.target.checked
                        ?[...current,doc.id]
                        :current.filter(id=>id!==doc.id))}/>
                  </td>}
                  {selectingDocs&&!group&&!selectableDocIds.has(doc.id)&&<td className="px-3 py-2.5"/>}
                  {selectingDocs&&group&&<td className="px-3 py-2.5"/>}
                  <td className="px-3 py-2.5 text-[11px] font-bold whitespace-nowrap" style={{ color:LT.link }}>#{doc.id}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color:LT.muted }}>{doc.createdAt?fmtLocalDateTime(doc.createdAt):fmtDate(doc.date)}</td>
                  <td className="px-3 py-2.5 text-[11px] font-semibold" style={{ color:LT.text }}>{doc.type}</td>
                  <td className="px-3 py-2.5 text-[11px] font-semibold" style={{ color:LT.sub }}>{doc.office}</td>
                  <td className="px-3 py-2.5 text-[11px] max-w-[120px] truncate" style={{ color:LT.sub }}>{doc.payrollVoucher}</td>
                  <td className="px-3 py-2.5 text-[11px] max-w-[120px] truncate" style={{ color:LT.sub }}>{doc.particulars}</td>
                  <td className="px-3 py-2.5 text-[11px] whitespace-nowrap" style={{ color:LT.sub }}>{doc.fund}</td>
                  <td className="px-3 py-2.5 text-[11px] whitespace-nowrap font-semibold" style={{ color:LT.text }}>₱{doc.amount.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-[11px] whitespace-nowrap" style={{ color:LT.sub }}>{doc.signature.split(" – ")[0]}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color:LT.muted }}>{getForwardedTimestamp(doc)?fmtLocalDateTime(getForwardedTimestamp(doc)):""}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium" style={{ color:LT.text }}>{doc.chequeNo??""}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color:LT.muted }}>{getReturnedTimestamp(doc)?fmtLocalDateTime(getReturnedTimestamp(doc)):""}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color:LT.sub }}>{doc.subType??""}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color:LT.muted }}>{doc.prNumber??""}</td>
                  {role==="staff"&&(group
                    ?firstVisibleGroupMember&&<td rowSpan={visibleGroupDocs.length}
                      className="px-3 py-2.5 align-middle" onClick={event=>event.stopPropagation()}>
                      <div className="flex w-fit items-center justify-center gap-2">
                        {isTrackingComplete?(
                          <button type="button" onClick={()=>onViewTracking?.(group.controlNo)}
                            className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                            style={{ borderColor:`${C.green}66`, background:`${C.green}12`, color:C.green }}>
                            View Tracking
                          </button>
                        ):(
                          <>
                            <button type="button" onClick={()=>setGroupQr(group)}
                              onMouseEnter={()=>setHoveredGroupQrId(group.groupId)}
                              onMouseLeave={()=>setHoveredGroupQrId(null)}
                              className="flex w-fit flex-col overflow-hidden rounded-lg border text-left text-[11px] font-semibold transition-colors hover:shadow-sm focus-visible:outline-none focus-visible:ring-2"
                              style={{ borderColor:`${C.purple}66`, background:C.card, color:C.blue }}
                              title="Click to view QR code"
                              aria-label={`Click to view QR code for group ${group.controlNo}`}>
                              {visibleGroupDocs.map((member,index)=>(
                                <span key={member.id}
                                  className={`flex min-h-[42px] items-center px-3 py-2 ${index<visibleGroupDocs.length-1?"border-b":""}`}
                                  style={{ borderColor:C.border }}>
                                  <span>SET · #{group.controlNo}</span>
                                </span>
                              ))}
                            </button>
                            {!!groupReturn?.returnedOffice&&role==="staff"&&(
                              <button type="button" disabled={receivingControlNo===group.startControlNo}
                                onClick={()=>void handleReceiveReturnedGroup(group)}
                                className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
                                style={{ borderColor:`${C.purple}66`, background:`${C.purple}12`, color:C.purple }}
                                title={`Receive returned group from ${groupReturn.returnedOffice}`}>
                                {receivingControlNo===group.startControlNo?"Receiving…":`Receive · ${groupReturn.returnedOffice}`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    :<td className="px-3 py-2.5 text-[11px] whitespace-nowrap font-semibold" onClick={event=>event.stopPropagation()}>
                    {(()=>{
                      const route=getOfficeForwardInfo(doc);
                      const pendingReturn=role==="staff"&&!!route.returnedOffice&&!route.received;
                      return isTrackingComplete?(
                        <button type="button" onClick={()=>onViewTracking?.(doc.id)}
                          className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                          style={{ borderColor:`${C.green}66`, background:`${C.green}12`, color:C.green }}>
                          View Tracking
                        </button>
                      ):pendingReturn?(
                        <button disabled={receivingControlNo===doc.id} onClick={()=>void handleReceiveReturned(doc)}
                          className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
                          style={{ borderColor:`${C.purple}66`, background:`${C.purple}12`, color:C.purple }}
                          title={`Receive returned document from ${route.returnedOffice}`}>
                          {receivingControlNo===doc.id?"Receiving…":`Receive · ${route.returnedOffice}`}
                        </button>
                      ):route.label?(
                        <button type="button" onClick={()=>{handleQr(doc.id);setQrDoc(doc);}}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                          style={{ borderColor:`${C.blue}66`, background:`${C.blue}12`, color:C.blue }}
                          title={`Show printable QR label for document ${doc.id}`}
                          aria-label={`Show printable QR label for document ${doc.id}`}>
                          <QrCode size={13}/>{route.label}
                        </button>
                      ):(
                        <span style={{ color:route.label.startsWith("Returned")||route.label.startsWith("Received")?C.green:route.label?C.blue:LT.muted }}>
                          {route.label}
                        </span>
                      );
                    })()}
                  </td>)}
                  {role==="staff"&&group
                    ?firstVisibleGroupMember&&<td rowSpan={visibleGroupDocs.length}
                      className="px-3 py-2.5 align-middle text-center" onClick={event=>event.stopPropagation()}>
                      {(()=>{
                        const allCompleted=group.documents.length>0&&group.documents.every(member=>
                          docs.some(item=>item.id===member.id&&!!getForwardedTimestamp(item)&&
                            hasCompleteDocumentDetails(item,hasCityAdminReceipt(item)))
                        );
                        return isTrackingComplete?(
                          <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color:C.green }}>
                            Completed
                          </span>
                        ):role==="staff"&&allCompleted&&hasCityAdminReceipt(doc)&&canEditDoc(doc)?(
                          <button onClick={()=>{setRouteAgainGroup(group);setRouteAgainGroupOffice("");}}
                            className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                            style={{ borderColor:`${C.purple}66`, background:`${C.purple}12`, color:C.purple }}>
                            Forward again
                          </button>
                        ):null;
                      })()}
                    </td>
                    :role==="staff"&&<td className="px-3 py-2.5 text-center" onClick={event=>event.stopPropagation()}>
                      {isTrackingComplete?(
                        <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color:C.green }}>
                          Completed
                        </span>
                      ):role==="staff"&&!!getForwardedTimestamp(doc)&&hasCompleteDocumentDetails(doc,hasCityAdminReceipt(doc))&&
                        hasCityAdminReceipt(doc)&&canEditDoc(doc)?(
                        <button onClick={()=>{setRouteAgainDoc(doc);setRouteAgainOffice("");}}
                          className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                          style={{ borderColor:`${C.purple}66`, background:`${C.purple}12`, color:C.purple }}>
                          Forward again
                        </button>
                      ):null}
                    </td>}
                </tr>
              )})}
              {filtered.length===0&&(
                <tr><td colSpan={14+(role==="staff"?2:0)+(selectingDocs?1:0)} className="py-10 text-center text-xs"
                  style={{ background:LT.rowBg, color:LT.muted }}>No documents match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ background:C.card }}>
          <Pagination total={filtered.length} shown={filtered.length}/>
        </div>
      </div>
    </div>
  );
}

// ─── TRACKING MONITORING ─────────────────────────────────────────────────────

function TrackingMonitoring({ trackingRecords, setTrackingRecords, groupTrackingRecords, setGroupTrackingRecords, docs, setDocs, role, user, onViewDocument, initialTrackingId, onInitialTrackingHandled }:{
  trackingRecords:TrackingRecord[];
  setTrackingRecords:React.Dispatch<React.SetStateAction<TrackingRecord[]>>;
  groupTrackingRecords:GroupTrackingRecord[];
  setGroupTrackingRecords:React.Dispatch<React.SetStateAction<GroupTrackingRecord[]>>;
  docs:DocRecord[]; setDocs:React.Dispatch<React.SetStateAction<DocRecord[]>>; role:Role; user:AuthUser|null; onViewDocument:(id:string)=>void; initialTrackingId?:string;
  onInitialTrackingHandled?:()=>void;
}) {
  const C=useC();
  const actor=getTrackingActor(user);
  const [filterOffice,setFilterOffice]=useState(""), [filterStage,setFilterStage]=useState("");
  const [selected,setSelected]=useState<TrackingRecord|null>(null);
  const [selectedGroup,setSelectedGroup]=useState<GroupTrackingRecord|null>(null);
  const [selectedGroupDocument,setSelectedGroupDocument]=useState<DocRecord|null>(null);
  const [trackingView,setTrackingView]=useState<"single"|"group">("single");
  const [showReceive,setShowReceive]=useState(false);
  const [showSingleComplete,setShowSingleComplete]=useState(false);
  const [singleCompleteSubmitting,setSingleCompleteSubmitting]=useState(false);
  const [showGroupReceive,setShowGroupReceive]=useState(false), [showGroupForward,setShowGroupForward]=useState(false);

  useEffect(()=>{
    if (!initialTrackingId) return;
    const group=groupTrackingRecords.find(record=>record.controlNo===initialTrackingId||
      record.documents.some(document=>document.id===initialTrackingId));
    if (group) {
      setTrackingView("group");
      setSelectedGroup(group);
      onInitialTrackingHandled?.();
      return;
    }
    const target=trackingRecords.find(record=>record.controlNo===initialTrackingId);
    if (target) {
      setTrackingView("single");
      setSelected(target);
      onInitialTrackingHandled?.();
    }
  },[initialTrackingId,onInitialTrackingHandled,trackingRecords,groupTrackingRecords]);

  const STAGE_CFG:Record<string,{color:string;bg:string}>={
    "Awaiting Receipt":{ color:"#F59E0B", bg:"rgba(245,158,11,0.12)" },
    "Received":        { color:"#3B82F6", bg:"rgba(59,130,246,0.12)" },
    "For Signature":   { color:"#8B5CF6", bg:"rgba(139,92,246,0.12)" },
    "Complete":        { color:"#10B981", bg:"rgba(16,185,129,0.12)" },
  };

  const filtered=trackingRecords.filter(r=>{
    const pos=getCurrentPosition(r);
    return (filterOffice===""||pos.office===filterOffice)&&(filterStage===""||pos.stage===filterStage);
  }).sort((left,right)=>getLatestTrackingActivityTime(right)-getLatestTrackingActivityTime(left));
  const filteredGroups=groupTrackingRecords.filter(record=>{
    const pos=getCurrentPosition(record);
    return (filterOffice===""||pos.office===filterOffice)&&(filterStage===""||pos.stage===filterStage);
  }).sort((left,right)=>getLatestTrackingActivityTime(right)-getLatestTrackingActivityTime(left));
  const refreshGroupTracking=async()=>{
    const response=await fetch('/api/group-tracking.php',{cache:'no-store'});
    const payload=await response.json();
    if (!response.ok||!payload?.success) throw new Error(payload?.message??`Unable to refresh group tracking (${response.status})`);
    const groups:GroupTrackingRecord[]=payload.groups??[];
    setGroupTrackingRecords(groups);
    return groups;
  };
  const handleGroupAction=async(action:"receive"|"forward"|"dispatch"|"complete",options?:{forwardDest?:string;forwardedBy?:string})=>{
    if (!selectedGroup) return;
    if (!actor) { alert("Add your 11-digit contact number in your profile before updating group tracking."); return; }
    try {
      const response=await fetch('/api/group-tracking-update.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          groupId:selectedGroup.groupId,office:"CA",action,
          forwardedTo:options?.forwardDest,actor:options?.forwardedBy??actor,
        }),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) throw new Error(payload?.message??`Group tracking update failed (${response.status})`);
      const groups=await refreshGroupTracking();
      const updated=groups.find(group=>group.groupId===selectedGroup.groupId)??null;
      setSelectedGroup(updated);
      if (action==="receive") setShowGroupReceive(false);
      if (action==="forward"||action==="dispatch") setShowGroupForward(false);
      if (action==="forward"||action==="dispatch") {
        setDocs(current=>current.map(doc=>selectedGroup.documents.some(member=>member.id===doc.id)
          ?{...doc,status:"Completed",dateForwarded:doc.dateForwarded??payload.updatedAt??nowTs()}
          :doc));
      }
      if (action==="receive") {
        setDocs(current=>current.map(doc=>selectedGroup.documents.some(member=>member.id===doc.id)
          ?{...doc,dateReturned:doc.dateReturned&&!doc.dateReturned.startsWith("0000-")?doc.dateReturned:payload.updatedAt??nowTs()}
          :doc));
      }
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to update grouped-document tracking.");
    }
  };

  const handleCAReceipt=async(opts:{forwardedBy:string})=>{
    if (!selected) return;
    if (!actor) { alert("Add your 11-digit contact number in your profile before confirming receipt."); return; }
    try {
      const response=await fetch('/api/tracking-update.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({controlNo:selected.controlNo,office:"CA",action:"receive",actor:opts.forwardedBy}),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Receipt failed (${response.status})`);
      }
      const ts=payload.updatedAt??nowTs();
      const receivedBy=opts.forwardedBy;
      setTrackingRecords(p=>p.map(r=>
        r.id===selected.id
          ?r.visits
            ?{ ...r, visits:[...r.visits,{ office:"CA", received:ts, receivedBy }] }
            :{ ...r, caReturn:{ received:ts, receivedBy } }
          :r
      ));
      setDocs(current=>current.map(doc=>doc.id===selected.controlNo
        ?{...doc,dateReturned:doc.dateReturned&&!doc.dateReturned.startsWith("0000-")?doc.dateReturned:ts}
        :doc));
      setShowReceive(false);
      setSelected(null);
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to confirm document receipt.");
    }
  };
  const handleSingleComplete=async(opts:{forwardedBy:string})=>{
    if (!selected) return;
    const completedBy=opts.forwardedBy.trim();
    if (!completedBy) {
      alert("Add your staff details before completing tracking.");
      return;
    }
    setSingleCompleteSubmitting(true);
    try {
      const response=await fetch('/api/tracking-update.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({controlNo:selected.controlNo,office:"CA",action:"complete",actor:completedBy}),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Tracking completion failed (${response.status})`);
      }
      const updated={...selected,completedAt:payload.updatedAt??nowTs(),completedBy};
      setTrackingRecords(current=>current.map(record=>record.id===selected.id?updated:record));
      setSelected(updated);
      setShowSingleComplete(false);
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to complete document tracking.");
    } finally {
      setSingleCompleteSubmitting(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {showSingleComplete&&selected&&(
        <ConfirmActionModal action="complete" targetOffice="City Administrator's Office"
          defaultActor={actor}
          trackingDetails={{
            controlNo:selected.controlNo,
            particulars:selected.particulars,
            type:selected.type,
            office:"City Administrator's Office",
          }}
          submitting={singleCompleteSubmitting}
          onConfirm={options=>void handleSingleComplete(options)}
          onCancel={()=>setShowSingleComplete(false)}/>
      )}
      {showReceive&&selected&&(
        <ConfirmActionModal action="receive" targetOffice="City Administrator's Office"
          defaultActor={actor}
          onConfirm={handleCAReceipt} onCancel={()=>setShowReceive(false)}/>
      )}
      {showGroupReceive&&selectedGroup&&(
        <ConfirmActionModal action="receive" targetOffice="City Administrator's Office · Group"
          defaultActor={actor}
          onConfirm={options=>void handleGroupAction("receive",{forwardedBy:options.forwardedBy})}
          onCancel={()=>setShowGroupReceive(false)}/>
      )}
      {showGroupForward&&selectedGroup&&(
        <ConfirmActionModal action="forward" targetOffice="Forward Group from City Admin"
          nextOffices={["CTO","CBO","CAO"]}
          defaultActor={actor}
          onConfirm={options=>void handleGroupAction("dispatch",{forwardDest:options.forwardDest,forwardedBy:actor})}
          onCancel={()=>setShowGroupForward(false)}/>
      )}
      {selected&&!showReceive&&createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex:1000, background:"rgba(0,0,0,0.65)", overflowY:"auto" }}
          onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="tracking-dialog-title"
            className="rounded-2xl w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden modal-panel-enter"
            style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex flex-shrink-0 items-center justify-between px-6 py-4"
              style={{ borderBottom:`1px solid ${C.border}` }}>
              <div>
                <p id="tracking-dialog-title" className="text-sm font-bold" style={{ color:C.text }}>Document #{selected.controlNo}</p>
                <p className="text-xs mt-0.5" style={{ color:C.muted }}>4-Office Journey Tracking</p>
              </div>
              <button onClick={()=>setSelected(null)} aria-label="Close document details" className="text-xl" style={{ color:C.muted }}>×</button>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto">
              <div className="p-4 rounded-xl overflow-x-auto" style={{ background:C.card2 }}>
                <div style={{ minWidth:420 }}>
                  <JourneyStepper record={selected}/>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color:C.muted }}>Document Status</p>
                <DocumentStatusCard record={selected} doc={docs.find(d=>d.id===selected.controlNo)}/>
              </div>
              {(()=>{
                const doc=docs.find(d=>d.id===selected.controlNo);
                if (!doc) return null;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {([["Payroll/Voucher",doc.payrollVoucher],["Fund",doc.fund],
                      ["Amount","₱"+doc.amount.toLocaleString()],["Signatory",doc.signature],
                    ] as [string,string][]).map(([k,v])=>(
                      <div key={k} className="rounded-lg p-2.5" style={{ background:C.card2 }}>
                        <div className="text-xs mb-0.5" style={{ color:C.muted }}>{k}</div>
                        <div className="text-xs font-semibold" style={{ color:C.text }}>{v}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {(()=>{
                const pos=getCurrentPosition(selected);
                if (pos.office==="CA"&&pos.stage==="Awaiting Receipt") return (
                  <div className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)" }}>
                    <span className="text-lg">📬</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold" style={{ color:"#F59E0B" }}>Awaiting receipt at City Admin's Office</p>
                      <p className="text-xs mt-0.5" style={{ color:C.muted }}>CAO has forwarded this document back.</p>
                    </div>
                    {role==="staff"&&(
                      <button onClick={()=>setShowReceive(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background:"#10B981", color:"#fff" }}>Confirm Receipt</button>
                    )}
                  </div>
                );
                return null;
              })()}
              {role==="staff"&&getCurrentPosition(selected).office==="CA"&&
                getCurrentPosition(selected).stage==="Received"&&!selected.completedAt&&(
                <div className="flex justify-end">
                  <Btn variant="success" onClick={()=>setShowSingleComplete(true)}>Complete Tracking</Btn>
                </div>
              )}
              {selected.completedAt&&(
                <div role="status" className="rounded-xl p-3"
                  style={{ background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.25)" }}>
                  <p className="text-xs font-semibold" style={{ color:"#059669" }}>Tracking Completed</p>
                  <p className="text-xs mt-1" style={{ color:C.sub }}>{fmtStepDate(selected.completedAt)}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button onClick={()=>{ onViewDocument(selected.controlNo); setSelected(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ borderColor:C.border, color:C.purple, background:`${C.purple}12` }}>
                  View Document
                </button>
                <Btn variant="ghost" onClick={()=>setSelected(null)}>Close</Btn>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {selectedGroup&&createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex:1000, background:"rgba(0,0,0,0.65)", overflowY:"auto" }}
          onClick={event=>event.target===event.currentTarget&&setSelectedGroup(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Tracking details for group ${selectedGroup.controlNo}`}
            className="rounded-2xl w-full max-w-4xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden modal-panel-enter"
            style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom:`1px solid ${C.border}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color:C.text }}>Group #{selectedGroup.controlNo}</p>
                <p className="text-xs mt-0.5" style={{ color:C.muted }}>{selectedGroup.documents.length} documents · shared journey</p>
              </div>
              <button onClick={()=>setSelectedGroup(null)} aria-label="Close group tracking details" className="text-xl" style={{ color:C.muted }}>×</button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="p-4 rounded-xl overflow-x-auto" style={{ background:C.card2 }}>
                <div style={{ minWidth:420 }}><JourneyStepper record={selectedGroup}/></div>
              </div>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor:C.border }}>
                <table className="w-full min-w-[520px] text-left">
                  <thead><tr style={{ background:C.sidebar }}>
                    {["Control No.","Particulars / Details","Type","P.R. No.","Status",""].map(label=>
                      <th key={label} className="px-3 py-2.5 text-xs font-semibold" style={{ color:C.text }}>{label}</th>
                    )}
                  </tr></thead>
                  <tbody>{selectedGroup.documents.map(doc=>(
                    <tr key={doc.id} style={{ borderTop:`1px solid ${C.border}` }}>
                      <td className="px-3 py-2.5 text-xs font-semibold" style={{ color:C.purple }}>#{doc.id}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color:C.sub }}>{doc.particulars}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color:C.sub }}>{doc.type}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color:C.sub }}>{doc.prNumber??"—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={selectedGroup.completedAt?"Completed":doc.status}/></td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" onClick={()=>setSelectedGroupDocument(docs.find(item=>item.id===doc.id)??doc)}
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                          style={{ borderColor:`${C.purple}66`, background:`${C.purple}12`, color:C.purple }}>
                          View document
                        </button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color:C.muted }}>Office Journey</p>
                <DocumentStatusCard record={selectedGroup} doc={selectedGroup.documents[0]}
                  groupDocuments={selectedGroup.documents} showSummary={false}/>
              </div>
              {(()=>{
                const pos=getCurrentPosition(selectedGroup);
                if (pos.office==="CA"&&pos.stage==="Awaiting Receipt") {
                  return role==="staff"&&<div className="flex justify-end">
                    <Btn onClick={()=>setShowGroupReceive(true)}>Confirm Group Receipt</Btn>
                  </div>;
                }
                if (role==="staff"&&pos.office==="CA"&&pos.stage==="Received"&&!selectedGroup.completedAt) {
                  return <div className="flex justify-end gap-2">
                    <Btn variant="success" onClick={()=>void handleGroupAction("complete")}>Complete Group</Btn>
                    <Btn onClick={()=>setShowGroupForward(true)}>Forward Group Again</Btn>
                  </div>;
                }
                return null;
              })()}
              <div className="rounded-xl border p-4" style={{ borderColor:C.border, background:C.card2 }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-center" style={{ color:C.muted }}>
                  Group QR Code · #{selectedGroup.controlNo}
                </p>
                <div className="flex justify-center rounded-lg p-3" style={{ background:"#fff" }}>
                  <QRCodeSVG id={`tracking-group-qr-${selectedGroup.groupId}`}
                    value={getProcessorDocumentUrl(selectedGroup.controlNo)} size={180}
                    bgColor="#ffffff" fgColor="#0D1021" level="M"/>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {selectedGroupDocument&&createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex:1100, background:"rgba(0,0,0,0.72)", overflowY:"auto" }}
          onClick={event=>event.target===event.currentTarget&&setSelectedGroupDocument(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Document ${selectedGroupDocument.id} details`}
            className="rounded-2xl w-full max-w-5xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 modal-panel-enter"
            style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold" style={{ color:C.text }}>
                Document #{selectedGroupDocument.id} — Read Only
              </h3>
              <button type="button" onClick={()=>setSelectedGroupDocument(null)}
                aria-label="Close document details" className="text-xl" style={{ color:C.muted }}>×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ["Control No.","#"+selectedGroupDocument.id],
                ["Date",selectedGroupDocument.date?fmtDate(selectedGroupDocument.date):"—"],
                ["Type",selectedGroupDocument.type],
                ["Office",selectedGroupDocument.office],
                ["Payroll/Voucher",selectedGroupDocument.payrollVoucher],
                ["Particulars",selectedGroupDocument.particulars],
                ["Fund",selectedGroupDocument.fund],
                ["Amount","₱"+selectedGroupDocument.amount.toLocaleString()],
                ["Signatory",selectedGroupDocument.signature],
                ["Forwarded",selectedGroupDocument.dateForwarded?fmtLocalDateTime(selectedGroupDocument.dateForwarded):"—"],
                ["Cheque No.",selectedGroupDocument.chequeNo??"—"],
                ["Date Returned",selectedGroupDocument.dateReturned?fmtLocalDateTime(selectedGroupDocument.dateReturned):"—"],
                ["Type",selectedGroupDocument.subType??"—"],
                ["P.R. No.",selectedGroupDocument.prNumber??"—"],
                ["Status",selectedGroupDocument.status],
              ] as [string,string][]).map(([label,value])=>(
                <div key={label} className="rounded-lg p-3" style={{ background:C.card2 }}>
                  <div className="text-xs mb-1" style={{ color:C.muted }}>{label}</div>
                  <div className="text-xs font-semibold break-words" style={{ color:C.text }}>{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 flex justify-end" style={{ borderTop:`1px solid ${C.border}` }}>
              <Btn variant="ghost" onClick={()=>setSelectedGroupDocument(null)}>Close</Btn>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="flex items-center justify-between tracking-reveal" style={{ animationDelay:"80ms" }}>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color:C.text }}>Tracking Monitoring</h2>
          <p className="text-xs mt-0.5" style={{ color:C.muted }}>CA → CTO → CBO → CAO → CA · Updated via QR scans</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded"
          style={{ background:"rgba(59,130,246,0.15)", color:C.blue }}>
          {role==="admin"?"View Only":"Staff"}
        </span>
      </div>

      <div className="flex gap-2">
        {([
          { key:"single",label:"Single docs",count:trackingRecords.length },
          { key:"group",label:"Docs by Set",count:groupTrackingRecords.length },
        ] as const).map(tab=>(
          <button key={tab.key} type="button" onClick={()=>setTrackingView(tab.key)}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold border"
            style={{ borderColor:trackingView===tab.key?C.purple:C.border,
              background:trackingView===tab.key?`${C.purple}20`:C.card2,
              color:trackingView===tab.key?C.purple:C.sub }}>
            {tab.label} <span className="ml-1 opacity-75">({tab.count})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 tracking-reveal" style={{ animationDelay:"260ms" }}>
        {[{ label:"Office", val:filterOffice, set:setFilterOffice, opts:["CTO","CBO","CAO","CA","Complete"] },
          { label:"Stage",  val:filterStage,  set:setFilterStage,  opts:["Awaiting Receipt","Received","For Signature"] }].map(f=>(
          <select key={f.label} value={f.val} onChange={e=>f.set(e.target.value)}
            className="rounded-lg px-3 py-2.5 text-sm border outline-none"
            style={{ background:C.card2, borderColor:C.border, color:f.val?C.text:C.muted }}>
            <option value="">All {f.label}s</option>
            {f.opts.map(o=><option key={o}>{o}</option>)}
          </select>
        ))}
        {(filterOffice||filterStage)&&(
          <button onClick={()=>{ setFilterOffice(""); setFilterStage(""); }}
            className="text-sm px-4 py-2 rounded-lg border"
            style={{ borderColor:C.border, color:C.muted }}>Clear</button>
        )}
        <span className="text-sm ml-auto" style={{ color:C.muted }}>
          {trackingView==="single"?filtered.length:filteredGroups.length} {trackingView==="single"?"documents":"groups"}
        </span>
      </div>

      {trackingView==="single"&&(
        <div className="space-y-3">
          {filtered.map((record,index)=>{
            const pos=getCurrentPosition(record);
            const doc=docs.find(d=>d.id===record.controlNo);
            const sc=STAGE_CFG[pos.stage]??{ color:C.muted, bg:"rgba(255,255,255,0.05)" };
            return (
              <Card key={record.id} className="cursor-pointer transition-colors tracking-reveal"
                style={{ animationDelay:`${440+index*110}ms` }}>
                <div className="p-4" onClick={()=>setSelected(record)}>
                  <div className="overflow-x-auto mb-4">
                    <div style={{ minWidth:380 }}><JourneyStepper record={record} compact/></div>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-3"
                    style={{ borderTop:`1px solid ${C.border}` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color:C.purple }}>#{record.controlNo}</span>
                      <span className="text-xs" style={{ color:C.sub }}>{doc?.particulars??record.particulars}</span>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ background:C.card2, color:C.muted }}>{record.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background:sc.bg, color:sc.color }}>{pos.stage}</span>
                      <span className="text-xs font-semibold" style={{ color:C.sub }}>{pos.office}</span>
                      <span className="text-xs" style={{ color:C.muted }}>View →</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length===0&&(
            <div className="py-12 text-center tracking-reveal" style={{ animationDelay:"440ms" }}>
              <p className="text-xs" style={{ color:C.muted }}>No documents in transit match the current filters.</p>
            </div>
          )}
        </div>
      )}
      {trackingView==="group"&&(
        <div className="space-y-3">
          {filteredGroups.map((record,index)=>{
            const pos=getCurrentPosition(record);
            const sc=STAGE_CFG[pos.stage]??{ color:C.muted, bg:"rgba(255,255,255,0.05)" };
            return (
              <Card key={record.id} className="cursor-pointer transition-colors tracking-reveal"
                style={{ animationDelay:`${440+index*110}ms` }}>
                <div className="p-4" onClick={()=>setSelectedGroup(record)}>
                  <div className="overflow-x-auto mb-4">
                    <div style={{ minWidth:380 }}><JourneyStepper record={record} compact/></div>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-3"
                    style={{ borderTop:`1px solid ${C.border}` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color:C.purple }}>#{record.controlNo}</span>
                      <span className="text-xs" style={{ color:C.sub }}>{record.documents.length} documents · {record.particulars}</span>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ background:C.card2, color:C.muted }}>GROUP</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background:sc.bg, color:sc.color }}>{pos.stage}</span>
                      <span className="text-xs font-semibold" style={{ color:C.sub }}>{pos.office}</span>
                      <span className="text-xs" style={{ color:C.muted }}>View →</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {filteredGroups.length===0&&(
            <div className="py-12 text-center tracking-reveal">
              <p className="text-xs" style={{ color:C.muted }}>No grouped documents in transit match the current filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OFFICE MINI SYSTEM ───────────────────────────────────────────────────────

function getLatestGroupTransaction(group:GroupTrackingRecord) {
  const transactions=(group.visits??[]).flatMap(visit=>{
    const entries:{office:string;action:string;timestamp:string;actor?:string}[]=[];
    if (visit.received) entries.push({ office:visit.office, action:"Received", timestamp:visit.received, actor:visit.receivedBy });
    if (visit.forSig) entries.push({ office:visit.office, action:"Marked for signature", timestamp:visit.forSig });
    if (visit.forwarded) entries.push({
      office:visit.office,
      action:visit.forwardedTo?`Forwarded to ${visit.forwardedTo}`:"Forwarded",
      timestamp:visit.forwarded,
      actor:visit.forwardedBy,
    });
    return entries;
  });
  return transactions.sort((left,right)=>Date.parse(right.timestamp)-Date.parse(left.timestamp))[0]??null;
}

function GroupDocumentReadOnlyNotice({ group, doc, mutedTextColor="#475569" }:{
  group:GroupTrackingRecord; doc:DocRecord; mutedTextColor?:string;
}) {
  const recentTransaction=getLatestGroupTransaction(group);
  return (
    <div role="note" style={{ borderRadius:16, padding:16, background:"#EFF6FF", border:"1px solid #BFDBFE" }}>
      <p style={{ fontSize:13, fontWeight:700, color:"#1D4ED8", margin:0 }}>
        This document is part of a group and is view-only.
      </p>
      <p style={{ fontSize:11, color:mutedTextColor, margin:"5px 0 0" }}>
        Control No. #{doc.id} belongs to group #{group.controlNo}. Tracking actions apply to the group.
      </p>
      <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #BFDBFE" }}>
        <p style={{ fontSize:11, fontWeight:700, color:"#1E293B", margin:0 }}>Recent group transaction</p>
        {recentTransaction?(
          <p style={{ fontSize:11, color:mutedTextColor, margin:"5px 0 0" }}>
            {recentTransaction.action} at {recentTransaction.office} · {fmtStepDate(recentTransaction.timestamp)}
            {recentTransaction.actor?` · by ${recentTransaction.actor}`:""}
          </p>
        ):(
          <p style={{ fontSize:11, color:mutedTextColor, margin:"5px 0 0" }}>No group transactions have been recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function OfficeMiniSystem({ mode, docs, trackingRecords, groupTrackingRecords, setDocs, setTrackingRecords, setGroupTrackingRecords, onRefresh, refreshing }:{
  mode:AppMode; docs:DocRecord[];
  trackingRecords:TrackingRecord[];
  groupTrackingRecords:GroupTrackingRecord[];
  setDocs:React.Dispatch<React.SetStateAction<DocRecord[]>>;
  setTrackingRecords:React.Dispatch<React.SetStateAction<TrackingRecord[]>>;
  setGroupTrackingRecords:React.Dispatch<React.SetStateAction<GroupTrackingRecord[]>>;
  onRefresh:()=>Promise<void>; refreshing:boolean;
}) {
  const officeName=MODE_OFFICE_NAME[mode];
  const journeyStep=MODE_TO_STEP[mode] as string;
  const stepKey=STEP_KEY[journeyStep];
  const ACCENT:Record<AppMode,string>={
    "main":"#6C4FF5","processor":"#6C4FF5",
    "office-ct":"#3B82F6","office-cb":"#F59E0B","office-ca":"#10B981",
  };
  const accent=ACCENT[mode];
  const DC={ bg:"#0B0E1A", card:"#141827", card2:"#1A1F35", sidebar:"#0D1021",
    border:"rgba(255,255,255,0.07)", text:"#E8EAF2", muted:"#6B7494", sub:"#A0A8C0" };

  const [searchInput,setSearchInput]=useState(""), [scanning,setScanning]=useState(false);
  const [foundDoc,setFoundDoc]=useState<DocRecord|null>(null), [notFound,setNotFound]=useState(false);
  const [foundGroup,setFoundGroup]=useState<GroupTrackingRecord|null>(null);
  const [pendingAction,setPending]=useState<"receive"|"forward"|"complete"|null>(null);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [notificationMenuOpen,setNotificationMenuOpen]=useState(false);
  const [notificationFilter,setNotificationFilter]=useState<"incoming"|"signature"|"forward">("incoming");
  const [groupActionSaving,setGroupActionSaving]=useState(false);
  const [receiveAnimating,setReceiveAnimating]=useState(false);
  const [animatingButton,setAnimatingButton]=useState<string|null>(null);
  const [scanError,setScanError]=useState("");
  const [officeStaff,setOfficeStaff]=useState<OfficeStaffRow[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const documentDetailsRef=useRef<HTMLDivElement|null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (detectionRef.current) {
      cancelAnimationFrame(detectionRef.current);
      detectionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => () => stopCamera(), []);
  useEffect(()=>{
    fetch('/api/users.php').then(r=>r.json()).then(data=>{
      if (data.success) setOfficeStaff((data.officeStaff??[]).filter((member:OfficeStaffRow)=>member.office===officeName&&member.status==="Active"));
    }).catch(()=>setOfficeStaff([]));
  },[officeName]);

  const currentRecord=trackingRecords.find(r=>r.controlNo===(foundDoc?.id??""))??null;
  const currentGroup=groupTrackingRecords.find(group=>group.groupId===foundGroup?.groupId)??foundGroup;
  const officeNotifications=[
    ...trackingRecords
      .flatMap(record=>{
        const stage=getOfficeInboxStage(record,journeyStep);
        return stage?[{
        id:`document-${record.id}`,
        controlNo:record.controlNo,
        fromOffice:getForwardingOfficeName(record,journeyStep),
        fromOfficeCode:getForwardingOfficeCode(record,journeyStep),
        stage,
        kind:"Document",
      }]:[];
      }),
    ...groupTrackingRecords
      .flatMap(group=>{
        const stage=getOfficeInboxStage(group,journeyStep);
        return stage?[{
        id:`group-${group.groupId}`,
        controlNo:group.controlNo,
        fromOffice:getForwardingOfficeName(group,journeyStep),
        fromOfficeCode:getForwardingOfficeCode(group,journeyStep),
        stage,
        kind:"Document group",
      }]:[];
      }),
  ];
  const visibleOfficeNotifications=officeNotifications.filter(notification=>
    (notificationFilter==="incoming"&&notification.stage==="Awaiting Receipt")||
    (notificationFilter==="signature"&&notification.stage==="For Signature")||
    (notificationFilter==="forward"&&notification.stage==="Ready to Forward"),
  );
  const notificationCounts:Record<typeof notificationFilter,number>={
    incoming:officeNotifications.filter(notification=>notification.stage==="Awaiting Receipt").length,
    signature:officeNotifications.filter(notification=>notification.stage==="For Signature").length,
    forward:officeNotifications.filter(notification=>notification.stage==="Ready to Forward").length,
  };
  const notificationFilterLabel=notificationFilter==="incoming"?"Incoming documents"
    :notificationFilter==="signature"?"For Sign":"For Forward";

  const handleSearch=(input:string)=>{
    const normalized=input.replace(/^#/,"").trim();
    const range=parseGroupRangeFromQr(normalized);
    const group=range?groupTrackingRecords.find(item=>item.controlNo===range):undefined;
    if (group) {
      setFoundGroup(group);
      setFoundDoc(null);
      setNotFound(false);
      return;
    }
    setFoundGroup(null);
    const cn=normalized.padStart(7,"0");
    const doc=docs.find(d=>d.id===cn);
    const documentGroup=doc
      ?groupTrackingRecords.find(item=>item.documents.some(member=>member.id===cn))??null
      :null;
    setFoundDoc(doc??null);
    setFoundGroup(documentGroup);
    setNotFound(!doc);
  };

  const openOfficeNotification=(controlNo:string)=>{
    setSearchInput(controlNo);
    handleSearch(controlNo);
    setNotificationsOpen(false);
    window.setTimeout(()=>{
      documentDetailsRef.current?.scrollIntoView({ behavior:"smooth", block:"start" });
    },0);
  };

  const handleScan=async()=>{
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("This browser does not support camera access. Please enter the control number manually.");
      return;
    }

    setScanning(true);
    setScanError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detectorCtor = (window as Window & {
        BarcodeDetector?: new (options?: { formats?: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
        };
      }).BarcodeDetector;

      if (!detectorCtor) {
        setScanning(false);
        stopCamera();
        setScanError("Camera is available, but QR detection is not supported on this browser. Please enter the control number manually.");
        return;
      }

      const detector = new detectorCtor({ formats: ["qr_code"] });
      const detectLoop = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const match = codes.find(code => !!code.rawValue && (parseGroupRangeFromQr(code.rawValue)||parseControlNumberFromQr(code.rawValue)));
          if (match?.rawValue) {
            const controlNo = parseGroupRangeFromQr(match.rawValue)??parseControlNumberFromQr(match.rawValue);
            if (controlNo) {
              stopCamera();
              setScanning(false);
              setSearchInput(controlNo);
              handleSearch(controlNo);
              return;
            }
          }
        } catch {
          // Keep scanning while the camera remains active.
        }

        if (streamRef.current) {
          detectionRef.current = requestAnimationFrame(detectLoop);
        }
      };

      detectionRef.current = requestAnimationFrame(detectLoop);
    } catch {
      setScanning(false);
      stopCamera();
      setScanError("Camera permission was denied. Please allow access or enter the control number manually.");
    }
  };

  const applyAction=async(action:"receive"|"forSig"|"forward"|"complete", opts?:{forwardedBy?:string;forwardDest?:string}):Promise<boolean>=>{
    const controlNo=foundDoc?.id??"";
    try {
      const result=await syncTrackingAction({ controlNo, office:journeyStep, action, forwardedTo:opts?.forwardDest, actor:opts?.forwardedBy });
      const ts=result.updatedAt??nowTs();
      if (action==="complete") {
        const actor=opts?.forwardedBy?.trim();
        setTrackingRecords(prev=>prev.map(record=>record.controlNo===controlNo
          ?{...record,completedAt:ts,completedBy:actor}
          :record));
        await onRefresh();
        return true;
      }
      if (action==="forward"&&journeyStep==="CA") {
        setDocs(current=>current.map(doc=>doc.id===controlNo
          ?{...doc,dateForwarded:doc.dateForwarded&&!doc.dateForwarded.startsWith("0000-")?doc.dateForwarded:ts,status:"Completed"}
          :doc));
      }
      setTrackingRecords(prev=>{
        let arr=[...prev];
        let idx=arr.findIndex(r=>r.controlNo===controlNo);
        if (idx===-1) {
          arr.push({ id:`T${Date.now()}`, controlNo, particulars:foundDoc?.particulars??"",
            type:(foundDoc?.type??"DV") as "DV"|"DC"|"DF", initiatedAt:ts });
          idx=arr.length-1;
        }
        const r={...arr[idx]};
        const visits=r.visits?[...r.visits]:[];
        if (!r.visits) {
          const legacyStep=(r[stepKey]??{}) as OfficeStepData;
          if (legacyStep.received||legacyStep.forSig||legacyStep.forwarded) {
            visits.push({ office:journeyStep, ...legacyStep });
          }
        }
        if (r.visits||visits.length>0) {
          const last=visits[visits.length-1];
          if (action==="receive") {
            if (!last||last.office!==journeyStep||last.forwarded) {
              visits.push({ office:journeyStep, received:ts, receivedBy:opts?.forwardedBy });
            } else {
              visits[visits.length-1]={ ...last, received:ts, receivedBy:opts?.forwardedBy };
            }
          } else if (last?.office===journeyStep) {
            visits[visits.length-1]=action==="forSig"
              ?{ ...last, forSig:ts }
              :{ ...last, forwarded:ts, forwardedTo:opts?.forwardDest??NEXT_STEP[journeyStep], forwardedBy:opts?.forwardedBy };
          }
          arr[idx]={ ...r, visits };
          return arr;
        }
        const cur=(r[stepKey]??{}) as OfficeStepData;
        let updated:OfficeStepData;
        if      (action==="receive")  updated={...cur, received:ts, receivedBy:opts?.forwardedBy};
        else if (action==="forSig")   updated={...cur, forSig:ts};
        else {
          const d=opts?.forwardDest??NEXT_STEP[journeyStep];
          updated={...cur, forwarded:ts, forwardedTo:d, forwardedBy:opts?.forwardedBy};
        }
        arr[idx]={...r,[stepKey]:updated};
        return arr;
      });
      return true;
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to update the document tracking.");
      return false;
    }
  };
  const applyGroupAction=async(
    action:"receive"|"forSig"|"forward"|"complete",
    opts?:{forwardedBy?:string;forwardDest?:string},
  ):Promise<boolean>=>{
    const group=currentGroup;
    if (!group) {
      alert("The grouped tracking record is no longer available. Refresh and scan the SET QR again.");
      return false;
    }
    const actor=opts?.forwardedBy?.trim();
    if (!actor) {
      alert("Select or enter the processing staff details before confirming.");
      return false;
    }
    try {
      const response=await fetch('/api/group-tracking-update.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          groupId:group.groupId,office:journeyStep,action,
          forwardedTo:opts?.forwardDest,actor,
        }),
      });
      const payload=await response.json().catch(()=>null);
      if (!response.ok||!payload?.success) {
        throw new Error(payload?.message??`Group tracking update failed (${response.status})`);
      }
      const groupsResponse=await fetch('/api/group-tracking.php',{cache:'no-store'});
      const groupsPayload=await groupsResponse.json().catch(()=>null);
      if (!groupsResponse.ok||!groupsPayload?.success) {
        throw new Error(groupsPayload?.message??`Tracking action saved, but group tracking could not be refreshed (${groupsResponse.status}).`);
      }
      const groups:GroupTrackingRecord[]=groupsPayload.groups??[];
      const updatedGroup=groups.find(item=>item.groupId===group.groupId);
      if (!updatedGroup) throw new Error("Tracking action saved, but the updated group could not be found. Reload the group tracking record.");
      setGroupTrackingRecords(groups);
      setFoundGroup(updatedGroup);
      await onRefresh();
      return true;
    } catch(error) {
      alert(error instanceof Error?error.message:"Unable to update the grouped-document journey.");
      return false;
    }
  };

  const receiveDirectly=()=>{
    setReceiveAnimating(true);
    setPending("receive");
    window.setTimeout(()=>setReceiveAnimating(false),500);
  };

  const animateButton=(buttonId:string, action:()=>void)=>{
    setAnimatingButton(buttonId);
    action();
    window.setTimeout(()=>setAnimatingButton(null),500);
  };

  const activeTrackingRecord=currentGroup??currentRecord;
  const currentVisit=activeTrackingRecord?.visits?.[activeTrackingRecord.visits.length-1];
  const isProcessorHandoff=!!currentVisit?.forwarded&&currentVisit.forwardedTo==="PRC"&&
    ["CTO","CBO","CAO"].includes(journeyStep);
  const isIncoming=!!currentVisit?.forwarded&&
    (currentVisit.forwardedTo===journeyStep||isProcessorHandoff);
  const activeVisit=isIncoming?null:currentVisit?.office===journeyStep?currentVisit:null;
  const step=activeVisit??activeTrackingRecord?.[stepKey]??null;
  const activeOffice=activeTrackingRecord?getActiveTrackingOffice(activeTrackingRecord):null;
  const isCurrentOffice=activeOffice===null||activeOffice===journeyStep||isProcessorHandoff;
  const actionStep=isIncoming?null:step;
  const prog={ received:!!actionStep?.received, forSig:!!actionStep?.forSig, forwarded:!!actionStep?.forwarded };
  const canReceive=isCurrentOffice&&!prog.received;
  const canForSig=isCurrentOffice&&prog.received&&!prog.forSig;
  const canForward=isCurrentOffice&&prog.forSig&&!prog.forwarded;
  const isTrackingComplete=!!activeTrackingRecord?.completedAt;
  const canComplete=isCurrentOffice&&prog.received&&!prog.forwarded&&!isTrackingComplete;
  const allDone=isCurrentOffice&&prog.forwarded;
  const isGroupedDocumentLookup=!!(currentGroup&&foundDoc);

  const stepRecord:TrackingRecord=activeTrackingRecord??{
    id:"_tmp", controlNo:foundGroup?.controlNo??foundDoc?.id??"", particulars:foundDoc?.particulars??"",
    type:(foundDoc?.type??"DV") as "DV"|"DC"|"DF", initiatedAt:"",
  };

  return (
    <div className="min-h-screen page-enter" style={{ background:"#F0F2F8", fontFamily:"Inter,sans-serif" }}>
      {pendingAction&&(
        <ConfirmActionModal action={pendingAction} targetOffice={pendingAction==="forward"?"Forward Document":"Complete Tracking"}
          nextOffices={["CA","CTO","CBO","CAO"].filter(office=>office!==journeyStep)}
          staff={officeStaff}
          trackingDetails={pendingAction==="complete"?{
            controlNo:activeTrackingRecord?.controlNo??foundDoc?.id??"",
            particulars:activeTrackingRecord?.particulars??foundDoc?.particulars??"",
            type:activeTrackingRecord?.type??foundDoc?.type??"",
            office:MODE_OFFICE_NAME[mode],
          }:undefined}
          submitting={groupActionSaving}
          onConfirm={opts=>{
            if (groupActionSaving) return;
            setGroupActionSaving(true);
            if (currentGroup) {
              void applyGroupAction(pendingAction,opts).then(success=>{
                if (success) setPending(null);
              }).finally(()=>setGroupActionSaving(false));
              return;
            }
            void applyAction(pendingAction,opts).then(success=>{
              if (success) setPending(null);
            }).finally(()=>setGroupActionSaving(false));
          }}
          onCancel={()=>setPending(null)}/>
      )}

      <div style={{ background:DC.sidebar, borderBottom:`1px solid ${DC.border}` }}>
        <div style={{ maxWidth:520, margin:"0 auto", display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center",
          justifyContent:"space-between", padding:"12px 16px" }}>
          <div style={{ position:"relative", justifySelf:"start" }}>
            <button type="button" onClick={()=>setNotificationsOpen(open=>!open)}
              aria-label={`Incoming document notifications${officeNotifications.length?`, ${officeNotifications.length} awaiting receipt`:""}`}
              aria-expanded={notificationsOpen}
              style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center",
                width:38, height:36, borderRadius:8, background:"#fff", color:"#000",
                border:`1px solid ${DC.border}`, cursor:"pointer" }}>
              <Bell size={17}/>
              {officeNotifications.length>0&&(
                <span style={{ position:"absolute", top:-6, right:-6, minWidth:18, height:18, padding:"0 4px",
                  borderRadius:99, display:"flex", alignItems:"center", justifyContent:"center",
                  background:"#DC2626", color:"#fff", fontSize:10, fontWeight:700 }}>
                  {officeNotifications.length}
                </span>
              )}
            </button>
            {notificationsOpen&&(
              <div role="region" aria-label="Incoming document notifications"
                style={{ position:"absolute", zIndex:20, top:44, left:0, width:290,
                  padding:12, borderRadius:12, background:"#fff",
                  border:"1px solid #DDE1EE", boxShadow:"0 12px 32px rgba(15,23,42,0.18)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ position:"relative" }}>
                    <button type="button" onClick={()=>setNotificationMenuOpen(open=>!open)}
                      aria-haspopup="menu" aria-expanded={notificationMenuOpen}
                      style={{ display:"inline-flex", alignItems:"center", gap:5, padding:0, border:0,
                        background:"transparent", color:"#000", fontSize:13, fontWeight:700, cursor:"pointer",
                        whiteSpace:"nowrap" }}>
                      {notificationFilterLabel}
                      <span style={{ minWidth:17, height:17, padding:"0 4px", borderRadius:99,
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        background:"#E2E8F0", color:"#000", fontSize:10, fontWeight:700 }}>
                        {notificationCounts[notificationFilter]}
                      </span>
                      <ChevronDown size={15}/>
                    </button>
                    {notificationMenuOpen&&(
                      <div role="menu" aria-label="Notification categories"
                        style={{ position:"absolute", top:25, left:0, zIndex:30, minWidth:150, padding:4,
                          borderRadius:8, background:"#fff", border:"1px solid #DDE1EE",
                          boxShadow:"0 8px 24px rgba(15,23,42,0.16)" }}>
                        {([
                          ["incoming","Incoming documents"],
                          ["signature","For Sign"],
                          ["forward","For Forward"],
                        ] as const).map(([value,label])=>(
                          <button key={value} type="button" role="menuitem"
                            onClick={()=>{
                              setNotificationFilter(value);
                              setNotificationMenuOpen(false);
                            }}
                            style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                              gap:12, width:"100%", padding:"7px 9px", textAlign:"left",
                              border:0, borderRadius:5, background:notificationFilter===value?"#F1F5F9":"#fff",
                              color:"#000", fontSize:11, fontWeight:notificationFilter===value?700:500, cursor:"pointer" }}>
                            <span>{label}</span>
                            <span style={{ minWidth:17, height:17, padding:"0 4px", borderRadius:99,
                              display:"inline-flex", alignItems:"center", justifyContent:"center",
                              background:"#E2E8F0", color:"#000", fontSize:10, fontWeight:700 }}>
                              {notificationCounts[value]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={()=>setNotificationsOpen(false)} aria-label="Close notifications"
                    style={{ border:0, background:"transparent", color:"#000", fontSize:18, cursor:"pointer" }}>×</button>
                </div>
                {officeNotifications.length===0?(
                  <p style={{ margin:"8px 0 2px", color:"#000", fontSize:12 }}>No documents in this category.</p>
                ):visibleOfficeNotifications.length===0?(
                  <p style={{ margin:"8px 0 2px", color:"#000", fontSize:12 }}>No documents in this category.</p>
                ):(
                  <div style={{ display:"grid", gap:6, maxHeight:250, overflowY:"auto" }}>
                    {visibleOfficeNotifications.map(notification=>{
                      const canOpenDirectly=["CTO","CBO","CAO","PRC"].includes(notification.fromOfficeCode)||
                        (notification.fromOfficeCode==="CA"&&notification.stage!=="Awaiting Receipt");
                      const content=(
                        <>
                          <span style={{ display:"block", fontSize:11, fontWeight:700, color:"#000" }}>
                            {notification.kind} · #{notification.controlNo}
                          </span>
                          <span style={{ display:"block", marginTop:3, fontSize:10, fontWeight:600,
                            color:notification.stage==="Awaiting Receipt"?"#B91C1C"
                              :notification.stage==="For Signature"?"#2563EB":"#7C3AED" }}>
                            From {notification.fromOffice} · {notification.stage}
                          </span>
                          {!canOpenDirectly&&(
                            <span style={{ display:"block", marginTop:5, fontSize:10, fontWeight:600, color:"#475569" }}>
                              Scan the QR code to view this document.
                            </span>
                          )}
                        </>
                      );
                      return canOpenDirectly?(
                        <button key={notification.id} type="button"
                          onClick={()=>openOfficeNotification(notification.controlNo)}
                          style={{ width:"100%", padding:"9px 10px", borderRadius:8, textAlign:"left",
                            border:"1px solid #E2E8F0", background:"#F8FAFC", cursor:"pointer" }}>
                          {content}
                        </button>
                      ):(
                        <div key={notification.id} role="listitem"
                          style={{ width:"100%", padding:"9px 10px", borderRadius:8,
                            border:"1px solid #E2E8F0", background:"#F8FAFC" }}>
                          {content}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, justifySelf:"center" }}>
            <GingoogSeal size={34}/>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:"#fff", margin:0, lineHeight:1.2 }}>ADTRAQS</p>
              <p style={{ fontSize:13, color:accent, margin:0, lineHeight:1.2 }}>{officeName}</p>
            </div>
          </div>
          <button type="button" onClick={()=>window.location.reload()}
            style={{ display:"flex", alignItems:"center", gap:6, justifySelf:"end", padding:"7px 9px", borderRadius:8,
              background:"#fff", color:"#000", border:`1px solid ${DC.border}`,
              fontSize:11, fontWeight:600, cursor:"pointer" }}>
            <RefreshCw size={14}/>
            Reload
          </button>
        </div>
      </div>

      <div style={{ maxWidth:520, margin:"0 auto", padding:"20px 16px", display:"flex", flexDirection:"column", gap:16 }}>
        {!scanning?(
          <button onClick={()=>animateButton("scan",handleScan)} className={animatingButton==="scan"?"animate-pulse":""} style={{ width:"100%", borderRadius:20, padding:"20px 16px",
            display:"flex", flexDirection:"column", alignItems:"center", gap:8,
            background:accent, color:"#fff", border:"none", cursor:"pointer",
            boxShadow:`0 8px 24px ${accent}55`, fontSize:14, fontWeight:700 }}>
            <span style={{ fontSize:32 }}>📷</span>Scan QR Code
          </button>
        ):(
          <div style={{ width:"100%", borderRadius:20, padding:"12px 16px", display:"flex",
            flexDirection:"column", alignItems:"center", gap:12,
            background:"#1a1a2e", border:`2px solid ${accent}` }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width:"100%", maxHeight:240, borderRadius:16, background:"#000", objectFit:"cover" }} />
            <span style={{ fontSize:12, color:accent, fontWeight:600 }}>Scanning…</span>
            <div style={{ display:"flex", gap:6 }}>
              {[0,1,2].map(i=><div key={i} style={{ width:8, height:8, borderRadius:"50%", background:accent, opacity:0.4+i*0.3 }}/>)}
            </div>
          </div>
        )}
        {scanError&&(
          <div style={{ borderRadius:12, padding:"10px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", color:"#DC2626", fontSize:12 }}>{scanError}</div>
        )}
        <div>
          <p style={{ fontSize:12, textAlign:"center", color:"#000", marginBottom:12 }}>— or enter Control Number manually —</p>
          <div style={{ display:"flex", gap:8 }}>
            <input value={searchInput} onChange={e=>setSearchInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSearch(searchInput)}
              placeholder="e.g. 0000001 or 0000001-0000005"
              style={{ flex:1, borderRadius:12, padding:"12px 16px", fontSize:14,
                border:"1px solid #DDE1EE", background:"#fff", color:"#1A2035", outline:"none" }}/>
            <button onClick={()=>animateButton("search",()=>handleSearch(searchInput))} className={animatingButton==="search"?"animate-pulse":""}
              style={{ padding:"12px 20px", borderRadius:12, fontSize:14, fontWeight:700,
                background:accent, color:"#fff", border:"none", cursor:"pointer" }}>Search</button>
          </div>
        </div>

        {notFound&&<div style={{ borderRadius:16, padding:"16px", textAlign:"center", fontSize:14,
          background:"#FEF2F2", border:"1px solid #FECACA", color:"#DC2626" }}>Document not found.</div>}

        {(foundDoc||currentGroup)&&!notFound&&(
          <>
            <div ref={documentDetailsRef}
              style={{ borderRadius:20, padding:16, overflow:"hidden", background:"#fff", border:"1px solid #DDE1EE" }}>
              <div style={{ overflowX:"auto" }}>
                <div style={{ minWidth:360 }}><JourneyStepper record={stepRecord} compact labelColor="#000"/></div>
              </div>
            </div>
            <DocumentStatusCard record={stepRecord} doc={foundDoc??currentGroup?.documents[0]}
              stepKey={stepKey} groupDocuments={foundDoc?[foundDoc]:currentGroup?.documents} mutedTextColor="#000"/>
            {isGroupedDocumentLookup&&<GroupDocumentReadOnlyNotice group={currentGroup} doc={foundDoc} mutedTextColor="#000"/>}

            {!isGroupedDocumentLookup&&!isTrackingComplete&&!allDone&&isCurrentOffice&&(
              <div style={{ borderRadius:20, overflow:"hidden", background:"#fff", border:"1px solid #E2E8F0" }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid #E2E8F0",
                  display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:700, color:"#1A2035", margin:0 }}>Actions</p>
                    <p style={{ fontSize:11, color:"#000", margin:"2px 0 0" }}>Receive the document, then complete tracking or continue routing.</p>
                  </div>
                  {canComplete&&(
                    <button type="button" onClick={()=>setPending("complete")} disabled={groupActionSaving}
                      style={{ borderRadius:9, padding:"8px 14px", fontSize:12, fontWeight:700,
                        background:"#10B981", color:"#fff", border:"none", cursor:"pointer", flexShrink:0,
                        opacity:groupActionSaving?0.7:1 }}>
                      Complete
                    </button>
                  )}
                </div>
                <div style={{ padding:16, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                  {([
                    { id:"receive", label:"RECEIVE",  done:prog.received, active:canReceive, color:"#3B82F6", action:receiveDirectly },
                    { id:"forSig",  label:"FOR SIG.", done:prog.forSig,   active:canForSig,  color:"#8B5CF6", action:()=>currentGroup?void applyGroupAction("forSig",{forwardedBy:officeName||journeyStep}):applyAction("forSig") },
                    { id:"forward", label:"FWD",      done:prog.forwarded,active:canForward, color:"#10B981", action:()=>setPending("forward") },
                  ] as const).map(btn=>(
                    <div key={btn.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                      <button disabled={!btn.active&&!btn.done}
                        onClick={btn.active?()=>animateButton(btn.id,btn.action):undefined}
                        className={animatingButton===btn.id||(btn.id==="receive"&&receiveAnimating)?"animate-pulse":""}
                        style={{ width:"100%", borderRadius:12, padding:"12px 4px", fontSize:13, fontWeight:700,
                          background:btn.done?`${btn.color}18`:btn.active?btn.color:"#F0F2F8",
                          color:btn.done?btn.color:btn.active?"#fff":"#000",
                          border:btn.done?`2px solid ${btn.color}`:"none",
                          cursor:btn.active?"pointer":"default", opacity:!btn.active&&!btn.done?0.5:1 }}>
                        {btn.done?"✓":btn.label}
                      </button>
                      {btn.done&&step&&(
                        <span style={{ fontSize:10, color:"#000", textAlign:"center" }}>
                          {btn.id==="receive"&&step.received&&fmtStepDate(step.received)}
                          {btn.id==="forSig"&&step.forSig&&fmtStepDate(step.forSig)}
                          {btn.id==="forward"&&step.forwarded&&fmtStepDate(step.forwarded)}
                        </span>
                      )}
                      <span style={{ fontSize:11, fontWeight:600, color:"#000" }}>{btn.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isGroupedDocumentLookup&&!isCurrentOffice&&(
              !isTrackingComplete&&<div style={{ borderRadius:20, padding:16, textAlign:"center",
                background:"rgba(148,163,184,0.10)", border:"1px solid rgba(148,163,184,0.25)" }}>
                <p style={{ fontSize:13, fontWeight:600, color:"#000", margin:0 }}>
                  This document is assigned to {activeOffice}.
                </p>
                <p style={{ fontSize:12, color:"#000", marginTop:4 }}>
                  Actions will be available after the document is forwarded to this office.
                </p>
              </div>
            )}

            {isTrackingComplete&&(
              <div role="status" style={{ borderRadius:20, padding:16,
                background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.25)" }}>
                <p style={{ fontSize:14, fontWeight:700, color:"#059669", margin:0 }}>Document tracking complete</p>
                <p style={{ fontSize:12, color:"#000", margin:"5px 0 0" }}>
                  Completed {fmtStepDate(activeTrackingRecord.completedAt!)} · by {activeTrackingRecord.completedBy??"—"}
                </p>
                <p style={{ fontSize:11, color:"#475569", margin:"5px 0 0" }}>
                  Tracking is closed. This is separate from the document entry status.
                </p>
              </div>
            )}

            {!isGroupedDocumentLookup&&allDone&&(
              <div style={{ borderRadius:20, padding:16, textAlign:"center",
                background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.25)" }}>
                <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                <p style={{ fontSize:14, fontWeight:600, color:"#10B981", margin:0 }}>
                  {currentGroup?"Group forwarded to ":"Document forwarded to "}{step?.forwardedTo??NEXT_STEP[journeyStep]}
                </p>
                <p style={{ fontSize:12, color:"#000", marginTop:4 }}>
                  {step?.forwarded&&fmtStepDate(step.forwarded)} · by {step?.forwardedBy??"—"}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── PROCESSOR MINI SYSTEM ────────────────────────────────────────────────────

function ProcessorMiniSystem({ docs, trackingRecords, groupTrackingRecords, initialControlNumber, initialDataLoaded }:{
  docs:DocRecord[]; trackingRecords:TrackingRecord[]; groupTrackingRecords:GroupTrackingRecord[];
  initialControlNumber?:string; initialDataLoaded:boolean;
}) {
  const DC={ bg:"#0B0E1A", card:"#141827", card2:"#1A1F35", sidebar:"#0D1021",
    border:"rgba(255,255,255,0.07)", text:"#E8EAF2", muted:"#6B7494", sub:"#A0A8C0", purple:"#6C4FF5" };
  const [foundDoc,setFoundDoc]=useState<DocRecord|null>(null);
  const [foundRecord,setFoundRecord]=useState<TrackingRecord|null>(null);
  const [foundGroup,setFoundGroup]=useState<GroupTrackingRecord|null>(null);
  const [notFound,setNotFound]=useState(false);
  const initialLookupDone=useRef(false);

  const normalizeProcessorControlNumber=(value:string)=>value.replace(/\D/g,"").replace(/^0+(?=\d)/,"");

  const handleSearch=(input:string)=>{
    const normalized=input.replace(/^#/,"").trim();
    const groupRange=parseGroupRangeFromQr(normalized);
    const matchingGroup=groupRange
      ?groupTrackingRecords.find(item=>item.controlNo===groupRange)??null
      :null;
    if (matchingGroup) {
      setFoundGroup(matchingGroup);
      setFoundDoc(null);
      setFoundRecord(null);
      setNotFound(false);
      return;
    }
    const controlNumber=parseControlNumberFromQr(normalized)??normalized;
    const canonicalControlNumber=normalizeProcessorControlNumber(controlNumber);
    const doc=docs.find(item=>normalizeProcessorControlNumber(item.id)===canonicalControlNumber);
    const rec=trackingRecords.find(item=>
      normalizeProcessorControlNumber(item.controlNo)===canonicalControlNumber,
    )??null;
    const documentGroup=doc
      ?groupTrackingRecords.find(item=>item.documents.some(member=>
        normalizeProcessorControlNumber(member.id)===canonicalControlNumber,
      ))??null
      :null;
    setFoundGroup(documentGroup);
    setFoundDoc(doc??null);
    setFoundRecord(documentGroup?null:rec);
    setNotFound(!doc&&!rec);
  };

  useEffect(()=>{
    if (!initialControlNumber||!initialDataLoaded||initialLookupDone.current) return;
    initialLookupDone.current=true;
    handleSearch(initialControlNumber);
  },[initialControlNumber,initialDataLoaded]);

  const processorTrackingRecord=foundGroup??foundRecord;
  const processorPosition=processorTrackingRecord?getCurrentPosition(processorTrackingRecord):null;
  const processorOfficeNames:Record<string,string>={
    CA:"City Administrator's Office",
    CTO:"City Treasurer's Office",
    CBO:"City Budget Office",
    CAO:"City Accounting Office",
    PRC:"Processors",
    Complete:"Tracking Complete",
  };
  const processorVisits=processorTrackingRecord?.visits??[];
  const latestProcessorReceipt=processorVisits.slice().reverse().find(visit=>visit.received)??null;
  const legacyReceipt=processorTrackingRecord
    ?[
      processorTrackingRecord.cto,
      processorTrackingRecord.cbo,
      processorTrackingRecord.cao,
      processorTrackingRecord.caReturn,
    ].filter((step):step is {received:string;receivedBy?:string}=>!!step?.received)
      .sort((left,right)=>Date.parse(right.received)-Date.parse(left.received))[0]
    :null;
  const processorReceivedBy=latestProcessorReceipt?.receivedBy??legacyReceipt?.receivedBy??"Not recorded";
  const processorStatus=processorPosition?.stage==="Awaiting Receipt"&&processorTrackingRecord&&
      isAwaitingReceiptAtOffice(processorTrackingRecord,processorPosition.office)
    ?"Forwarded"
    :processorPosition?.stage==="Complete"
      ?"Tracking Complete"
      :processorPosition?.stage??"Not yet received";
  const processorStatusColor=processorStatus==="Received"?"#3B82F6"
    :processorStatus==="For Signature"?"#8B5CF6"
      :processorStatus==="Forwarded"||processorStatus==="Tracking Complete"?"#10B981"
        :"#64748B";

  return (
    <div className="min-h-screen page-enter" style={{ background:"#F0F2F8", fontFamily:"Inter,sans-serif" }}>
      <div style={{ background:DC.sidebar, borderBottom:`1px solid ${DC.border}` }}>
        <div style={{ maxWidth:520, margin:"0 auto", display:"flex", justifyContent:"center", alignItems:"center", padding:"12px 16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <GingoogSeal size={34}/>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:"#fff", margin:0, lineHeight:1.3 }}>ADTRAQS</p>
              <p style={{ fontSize:12, color:DC.purple, margin:0 }}>Processor · Document Status Lookup</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:520, margin:"0 auto", padding:"20px 16px", display:"flex", flexDirection:"column", gap:16 }}>
        {notFound&&<div style={{ borderRadius:16, padding:"16px", textAlign:"center",
          background:"#FEF2F2", border:"1px solid #FECACA", color:"#DC2626", fontSize:14 }}>Document not found.</div>}

        {(foundDoc||foundRecord||foundGroup)&&!notFound&&(
          <>
            <div style={{ borderRadius:16, padding:16, background:"#fff", border:"1px solid #E2E8F0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:"#1A2035", margin:"0 0 6px" }}>Tracking summary</p>
                  <span style={{ fontSize:13, fontWeight:800, color:"#6C4FF5" }}>
                    #{foundDoc?.id??foundGroup?.controlNo??foundRecord?.controlNo}
                  </span>
                </div>
                <span style={{ flexShrink:0, borderRadius:999, padding:"5px 10px", fontSize:11, fontWeight:700,
                  color:processorStatusColor, background:`${processorStatusColor}18` }}>
                  {processorStatus}
                </span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={{ fontSize:10, color:"#000" }}>Current office</div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#1A2035", marginTop:2 }}>
                    {processorPosition
                      ?processorOfficeNames[processorPosition.office]??processorPosition.office
                      :"City Administrator's Office"}
                  </div>
                </div>
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ fontSize:10, color:"#000" }}>Most recently received by</div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#1A2035", marginTop:2 }}>{processorReceivedBy}</div>
                </div>
              </div>
            </div>
            {foundGroup?(
              <div style={{ borderRadius:20, padding:16, overflow:"hidden", background:"#fff", border:"1px solid #DDE1EE" }}>
                <div style={{ overflowX:"auto" }}>
                  <div style={{ minWidth:360 }}><JourneyStepper record={foundGroup} compact labelColor="#000"/></div>
                </div>
              </div>
            ):foundRecord?(
              <div style={{ borderRadius:20, padding:16, overflow:"hidden", background:"#fff", border:"1px solid #DDE1EE" }}>
                <div style={{ overflowX:"auto" }}>
                  <div style={{ minWidth:360 }}><JourneyStepper record={foundRecord} compact labelColor="#000"/></div>
                </div>
              </div>
            ):(
              <div style={{ borderRadius:20, padding:16, background:"#fff", border:"1px solid #DDE1EE" }}>
                <p style={{ fontSize:12, color:"#000", margin:0 }}>This document has not yet entered the tracking journey.</p>
              </div>
            )}
            {foundGroup?(
              <>
                <DocumentStatusCard record={foundGroup} doc={foundDoc??foundGroup.documents[0]}
                  groupDocuments={foundDoc?[foundDoc]:foundGroup.documents} mutedTextColor="#000"/>
                {foundDoc&&<GroupDocumentReadOnlyNotice group={foundGroup} doc={foundDoc} mutedTextColor="#000"/>}
              </>
            ):foundRecord?(
              <DocumentStatusCard record={foundRecord} doc={foundDoc??undefined} mutedTextColor="#000"/>
            ):(
              <div style={{ borderRadius:16, padding:16, background:"#fff", border:"1px solid #E2E8F0" }}>
                <p style={{ fontSize:13, fontWeight:700, color:"#1A2035", margin:"0 0 8px" }}>#{foundDoc?.id}</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["Particulars",foundDoc?.particulars??"—"],["Type",foundDoc?.type??"—"],
                    ["Office",foundDoc?.office??"—"],["Status",foundDoc?.status??"—"]].map(([k,v])=>(
                    <div key={k}>
                      <div style={{ fontSize:10, color:"#000" }}>{k}</div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#1A2035", marginTop:2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {processorTrackingRecord?.completedAt&&(
          <div role="status" style={{ borderRadius:16, padding:16, textAlign:"center",
            background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.25)" }}>
            <p style={{ fontSize:20, fontWeight:800, color:"#059669", margin:0 }}>Tracking Completed</p>
            <p style={{ fontSize:13, fontWeight:600, color:"#1A2035", margin:"6px 0 0" }}>
              {fmtStepDate(processorTrackingRecord.completedAt)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────

function Reports({ docs, catalog, trackingRecords, groupTrackingRecords }:{
  docs:DocRecord[];
  catalog:CatalogData;
  trackingRecords:TrackingRecord[];
  groupTrackingRecords:GroupTrackingRecord[];
}) {
  const C=useC();
  const reportTypes=catalog.types;
  const reportSignatures=catalog.signatures;
  const dates=docs.map(doc=>doc.date).filter(Boolean).sort();
  const [fFrom,setFFrom]=useState(dates[0]??"");
  const [fTo,setFTo]=useState(dates[dates.length-1]??"");
  const [fSignature,setFSignature]=useState(""), [fType,setFType]=useState("");
  const [showExportReview,setShowExportReview]=useState(false);
  useEffect(()=>{
    if (!dates.length) return;
    setFFrom(current=>current||dates[0]);
    setFTo(current=>current||dates[dates.length-1]);
  },[dates.join("|")]);
  const filtered=docs.filter(d=>(!fFrom||d.date>=fFrom)&&(!fTo||d.date<=fTo)&&
    (fSignature===""||d.signature===fSignature)&&(fType===""||d.type===fType));
  const reportToday=systemDateKey(new Date());
  const latestFilteredControlNo=filtered.reduce((latest,doc)=>
    Number(doc.id)>Number(latest)?doc.id:latest,"" as string);
  const hasCityAdminReceipt=(doc:DocRecord)=>{
    const record=trackingRecords.find(item=>item.controlNo===doc.id);
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    return (!!record&&(!!record.caReturn?.received||!!record.visits?.some(visit=>visit.office==="CA"&&!!visit.received)))||
      (!!group&&(!!group.caReturn?.received||!!group.visits?.some(visit=>visit.office==="CA"&&!!visit.received)));
  };
  const getForwardedTimestamp=(doc:DocRecord)=>{
    const record=trackingRecords.find(item=>item.controlNo===doc.id);
    const individualDispatch=record?.visits?.find(visit=>
      visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded
    );
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    const groupDispatch=group?.visits?.find(visit=>
      visit.office==="CA"&&["CTO","CBO","CAO"].includes(visit.forwardedTo??"")&&!!visit.forwarded
    );
    const savedTimestamp=doc.dateForwarded&&!doc.dateForwarded.startsWith("0000-")?doc.dateForwarded:"";
    return individualDispatch?.forwarded??groupDispatch?.forwarded??savedTimestamp;
  };
  const canEditDoc=(doc:DocRecord)=>{
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    const record=group??trackingRecords.find(item=>item.controlNo===doc.id);
    if (!record) return !group;
    if (record.completedAt) return false;
    const position=getCurrentPosition(record);
    return (position.office==="CA"&&position.stage==="Received")||
      (position.office==="Complete"&&!!getForwardedTimestamp(doc));
  };
  const canForwardAgain=(doc:DocRecord)=>{
    const group=groupTrackingRecords.find(item=>item.documents.some(member=>member.id===doc.id));
    if (group?.completedAt) return false;
    if (group) {
      const allCompleted=group.documents.length>0&&group.documents.every(member=>{
        const currentDoc=docs.find(item=>item.id===member.id);
        return !!currentDoc&&!!getForwardedTimestamp(currentDoc)&&
          hasCompleteDocumentDetails(currentDoc,hasCityAdminReceipt(currentDoc));
      });
      return allCompleted&&hasCityAdminReceipt(doc)&&canEditDoc(doc);
    }
    return !!getForwardedTimestamp(doc)&&hasCompleteDocumentDetails(doc,hasCityAdminReceipt(doc))&&
      hasCityAdminReceipt(doc)&&canEditDoc(doc);
  };
  const signatureCounts=Array.from(filtered.reduce((counts,doc)=>{
    const signature=doc.signature.trim();
    if (signature) counts.set(signature,(counts.get(signature)??0)+1);
    return counts;
  },new Map<string,number>())).sort(([left],[right])=>left.localeCompare(right));
  const signedDocumentCount=signatureCounts.reduce((total,[,count])=>total+count,0);
  const entryStatusBreakdown=[
    { name:"Complete Entries", value:filtered.filter(hasCompleteDocumentEntry).length, color:"#60A5FA" },
    { name:"Incomplete Entries", value:filtered.filter(doc=>!hasCompleteDocumentEntry(doc)).length, color:"#F87171" },
  ];
  const typeBars=reportTypes.map(t=>({ name:t, repCount:filtered.filter(d=>d.type===t).length }));
  const signatureBars=reportSignatures.map(signature=>({
    name:signature.split(" – ")[0],
    signatureCount:filtered.filter(d=>d.signature===signature).length,
  }));
  const exportReport=()=>{
    const headers=["Control No.","Date","Type","Office","Particulars","Fund","Amount","Signatory",
      "Cheque No.","Date Fwd. (Returned)","Type","P.R. No."];
    const escape=(value:string|number)=>`"${String(value??"").replace(/"/g,"\"\"")}"`;
    const rows=filtered.slice().sort((a,b)=>b.id.localeCompare(a.id)).map(doc=>[
      `#${doc.id}`,doc.date,doc.type,doc.office,doc.particulars,doc.fund,doc.amount,
      doc.signature,doc.chequeNo??"",doc.dateReturned??"",doc.subType??"",doc.prNumber??"",
    ].map(escape).join(","));
    const blob=new Blob([[headers.map(escape).join(","),...rows].join("\r\n")],{ type:"text/csv;charset=utf-8;" });
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`smart-docs-report-${fFrom||"all"}-to-${fTo||"all"}.csv`;
    link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setShowExportReview(false);
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight" style={{ color:C.text }}>Reports</h2>
        <Btn size="large" onClick={()=>setShowExportReview(true)}>↓ Export — Excel / CSV</Btn>
      </div>
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color:C.sub }}>Filters</p>
        <div className="flex flex-wrap gap-4 items-end">
          {[{ label:"Date From", value:fFrom, set:setFFrom },{ label:"Date To", value:fTo, set:setFTo }].map(f=>(
            <div key={f.label}>
              <label className="block text-sm mb-1.5" style={{ color:C.muted }}>{f.label}</label>
              <input type="date" value={f.value} onChange={e=>f.set(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background:C.card2, borderColor:C.border, color:C.text }}/>
            </div>
          ))}
          <div>
            <label className="block text-sm mb-1.5" style={{ color:C.muted }}>Signature</label>
            <select value={fSignature} onChange={e=>setFSignature(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm border outline-none"
              style={{ background:C.card2, borderColor:C.border, color:C.text }}>
              <option value="">All Signatures</option>
              {reportSignatures.map(signature=><option key={signature}>{signature}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color:C.muted }}>Type</label>
            <select value={fType} onChange={e=>setFType(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm border outline-none"
              style={{ background:C.card2, borderColor:C.border, color:C.text }}>
              <option value="">All Types</option>
              {reportTypes.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3" style={{ color:C.text }}>Total Entries</p>
          <p className="text-2xl font-bold leading-none" style={{ color:C.text }}>{filtered.length}</p>
          <p className="mt-1 text-xs font-medium" style={{ color:C.muted }}>Matching report filters</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3" style={{ color:C.text }}>Documents Received Today</p>
          <p className="text-2xl font-bold leading-none" style={{ color:C.text }}>
            {filtered.filter(doc=>doc.date===reportToday).length}
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color:C.muted }}>
            {new Intl.DateTimeFormat(undefined,{timeZone:SYSTEM_TIME_ZONE,month:"short",day:"numeric",year:"numeric"}).format(new Date())}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3" style={{ color:C.text }}>Latest Control Number</p>
          <p className="text-2xl font-bold leading-none" style={{ color:C.text }}>{latestFilteredControlNo||"—"}</p>
          <p className="mt-1 text-xs font-medium" style={{ color:C.muted }}>Most recent matching entry</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3" style={{ color:C.text }}>Total Signatures</p>
          <p className="text-2xl font-bold leading-none" style={{ color:C.text }}>{signedDocumentCount}</p>
          <p className="mt-1 text-xs font-medium" style={{ color:C.muted }}>Assigned in matching report</p>
        </Card>
      </div>
      {showExportReview&&(
        <ModalOverlay onClose={()=>setShowExportReview(false)}>
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-bold" style={{ color:C.text }}>Review export</h3>
              <p className="text-sm mt-1" style={{ color:C.muted }}>
                Confirm these filters and counts before downloading the report.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Date from",fFrom?fmtDate(fFrom):"All dates"],
                ["Date to",fTo?fmtDate(fTo):"All dates"],
                ["Type",fType||"All types"],
                ["Signatory filter",fSignature||"All signatories"],
                ["Document total",String(filtered.length)],
                ["Documents with signatory",String(signedDocumentCount)],
              ].map(([label,value])=>(
                <div key={label} className="rounded-lg p-3" style={{ background:C.card2 }}>
                  <p className="text-xs mb-1" style={{ color:C.muted }}>{label}</p>
                  <p className="text-sm font-semibold break-words" style={{ color:C.text }}>{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor:C.border }}>
              <div className="flex items-center justify-between px-3 py-2"
                style={{ background:C.card2, borderBottom:`1px solid ${C.border}` }}>
                <span className="text-sm font-semibold" style={{ color:C.text }}>Document count by signatory</span>
                <span className="text-xs" style={{ color:C.muted }}>{signatureCounts.length} signatories</span>
              </div>
              {signatureCounts.length?(
                <div className="max-h-44 overflow-y-auto divide-y" style={{ borderColor:C.border }}>
                  {signatureCounts.map(([signature,count])=>(
                    <div key={signature} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm" style={{ color:C.sub }}>{signature}</span>
                      <span className="text-sm font-semibold" style={{ color:C.text }}>{count} {count===1?"document":"documents"}</span>
                    </div>
                  ))}
                </div>
              ):(
                <p className="px-3 py-4 text-sm" style={{ color:C.muted }}>No signatory assignments in these results.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={()=>setShowExportReview(false)}>Cancel</Btn>
              <Btn onClick={exportReport}>Confirm &amp; Download CSV</Btn>
            </div>
          </div>
        </ModalOverlay>
      )}
      <>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-xs font-semibold mb-3" style={{ color:C.sub }}>Entry Status Breakdown</p>
              <div className="flex items-center gap-4">
                <div style={{ width:100, height:100 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={entryStatusBreakdown} cx="50%" cy="50%" innerRadius={26} outerRadius={46}
                        isAnimationActive={false} dataKey="value" strokeWidth={0}>
                        {entryStatusBreakdown.map(d=><Cell key={`rc-${d.name}`} fill={d.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {entryStatusBreakdown.map(d=>(
                    <div key={`rl-${d.name}`} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background:d.color }}/>
                      <span className="text-xs" style={{ color:C.sub }}>{d.name}:</span>
                      <span className="text-xs font-bold" style={{ color:C.text }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold mb-3" style={{ color:C.sub }}>By Type</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={typeBars} margin={{ top:12, right:8, left:-24, bottom:0 }}>
                  <CartesianGrid vertical={false} stroke={C.border}/>
                  <XAxis dataKey="name" tick={{ fontSize:11, fill:C.sub }} tickLine={false} axisLine={false}/>
                  <YAxis tick={{ fontSize:10, fill:C.muted }} tickLine={false} axisLine={false}/>
                  <Bar dataKey="repCount" fill={C.purple} radius={[4,4,0,0]} isAnimationActive={false}>
                    <LabelList dataKey="repCount" position="top" style={{ fontSize:10, fill:C.text, fontWeight:600 }}/>
                  </Bar>
                  <Tooltip content={<ChartTip/>} cursor={{ fill:"rgba(0,0,0,0.03)" }}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold mb-3" style={{ color:C.sub }}>By Signature</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={signatureBars} layout="vertical" margin={{ top:0, right:28, left:0, bottom:0 }}>
                  <XAxis type="number" hide/>
                  <YAxis type="category" dataKey="name" width={34}
                    tick={{ fontSize:10, fill:C.sub }} tickLine={false} axisLine={false}/>
                  <Bar dataKey="signatureCount" fill={C.purple} radius={[0,4,4,0]} isAnimationActive={false}>
                    <LabelList dataKey="signatureCount" position="right" style={{ fontSize:10, fill:C.text, fontWeight:600 }}/>
                  </Bar>
                  <Tooltip content={<ChartTip/>} cursor={{ fill:"rgba(0,0,0,0.03)" }}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <BottleneckCard trackingRecords={trackingRecords}/>
      </>
    </div>
  );
}

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

interface UserRow { id:number; name:string; email:string; role:"Admin"|"Staff"; office:string; status:"Active"|"Pending"|"Inactive"; lastLogin:string; contactNumber:string; }
const ADMINISTRATIVE_OFFICE = "City Administrative Office";

function UserManagement() {
  const C=useC();
  const [showForm,setShowForm]=useState(false);
  const [users,setUsers]=useState<UserRow[]>([]);
  const [usersLoaded,setUsersLoaded]=useState(false);
  const [officeStaff,setOfficeStaff]=useState<OfficeStaffRow[]>([]);
  const [selectedOffice,setSelectedOffice]=useState("");
  const [form,setForm]=useState({
    firstName:"",
    lastName:"",
    email:"",
    role:"Staff",
    office:"",
    password:"",
    confirmPassword:"",
    contactNumber:"",
  });
  const [search,setSearch]=useState("");
  const [error,setError]=useState("");
  const [editingRole,setEditingRole]=useState<UserRow|null>(null);
  const [roleDraft,setRoleDraft]=useState<"Admin"|"Staff">("Staff");
  const [roleError,setRoleError]=useState("");
  const [editingOfficeStaff,setEditingOfficeStaff]=useState<OfficeStaffRow|null>(null);
  const [officeStaffDraft,setOfficeStaffDraft]=useState({fullName:"",contactNumber:"",office:"",status:"Active"});
  const [officeStaffError,setOfficeStaffError]=useState("");

  useEffect(()=>{
    if (!usersLoaded) return;
    const availableOffices=Array.from(new Set([
      ...users.map(user=>user.office),
      ...officeStaff.map(member=>member.office),
    ].filter(Boolean)));
    const preferred=availableOffices.includes(ADMINISTRATIVE_OFFICE)?ADMINISTRATIVE_OFFICE:availableOffices[0]??"";
    setSelectedOffice(current=>current&&availableOffices.includes(current)?current:preferred);
    setForm(current=>current.office&&availableOffices.includes(current.office)?current:{...current,office:preferred});
  },[users,officeStaff,usersLoaded]);

  const loadUsers=async ()=>{
    const response=await fetch('/api/users.php',{cache:'no-store'});
    const data=await response.json();
    if (!response.ok||!data.success) throw new Error(data.message||"Unable to load users.");
    setUsers(data.users||[]);
    setOfficeStaff(data.officeStaff||[]);
    setUsersLoaded(true);
  };

  useEffect(()=>{ void loadUsers().catch(error=>{
    setError(error.message||"Unable to connect to the database.");
    setUsersLoaded(true);
  }); },[]);

  const resetForm=()=>{
    setShowForm(false);
    setForm({ firstName:"", lastName:"", email:"", role:"Staff", office:selectedOffice, password:"", confirmPassword:"", contactNumber:"" });
  };

  const isAdministrativeOffice = form.office === ADMINISTRATIVE_OFFICE;

  const validateContactNumber = (value:string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return 'Contact number is required.';
    if (!/^\d{11}$/.test(digits)) return 'Contact number must be exactly 11 digits only.';
    return '';
  };
  const ss=(s:string)=>{
    if(s==="Active")  return { color:C.green, bg:`${C.green}22` };
    if(s==="Pending") return { color:C.blue,  bg:`${C.blue}22`  };
    return                   { color:C.muted, bg:C.card2        };
  };
  const toggle=async (user:UserRow)=>{ const status=user.status==="Active"?"inactive":"active"; const res=await fetch('/api/users.php',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id,status})}); if(res.ok) setUsers(us=>us.map(u=>u.id===user.id?{...u,status:status==='active'?"Active":"Inactive"}:u)); };
  const remove=async (id:number)=>{ const res=await fetch('/api/users.php',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); if(res.ok) setUsers(us=>us.filter(u=>u.id!==id)); };
  const removeOfficeStaff=async (id:number)=>{
    const response=await fetch('/api/users.php',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({contact_id:id})});
    if(response.ok) setOfficeStaff(members=>members.filter(member=>member.id!==id));
  };
  const saveOfficeStaff=async()=>{
    if (!editingOfficeStaff) return;
    setOfficeStaffError("");
    const fullName=officeStaffDraft.fullName.trim();
    const contactNumber=officeStaffDraft.contactNumber.replace(/\D/g,"");
    if (!fullName) { setOfficeStaffError("Name is required."); return; }
    if (!/^\d{11}$/.test(contactNumber)) { setOfficeStaffError("Contact number must be exactly 11 digits only."); return; }
    try {
      const response=await fetch('/api/users.php',{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          contact_id:editingOfficeStaff.id,
          full_name:fullName,
          contact_number:contactNumber,
          office:officeStaffDraft.office,
          status:officeStaffDraft.status.toLowerCase(),
        }),
      });
      const data=await response.json().catch(()=>null);
      if (!response.ok||!data?.success) {
        setOfficeStaffError(data?.message||"Unable to update office staff details.");
        return;
      }
      await loadUsers();
      setEditingOfficeStaff(null);
    } catch {
      setOfficeStaffError("Unable to connect to the XAMPP database.");
    }
  };
  const saveRole=async()=>{
    if (!editingRole) return;
    setRoleError("");
    const response=await fetch('/api/users.php',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editingRole.id,role:roleDraft.toLowerCase()})});
    const data=await response.json().catch(()=>null);
    if (!response.ok||!data?.success) { setRoleError(data?.message||"Unable to update role."); return; }
    setUsers(current=>current.map(user=>user.id===editingRole.id?{...user,role:roleDraft}:user));
    setEditingRole(null);
  };

  const createUser=async ()=>{ setError("");
    const firstName=form.firstName.trim();
    const lastName=form.lastName.trim();
    const office=form.office;
    const contactNumber=form.contactNumber.trim();
    const normalizedContactNumber = contactNumber.replace(/\D/g, '');

    if (!office) { setError("Please select which office you are adding the user to."); return; }
    if (!firstName || !lastName) { setError("First name and last name are required."); return; }

    if (isAdministrativeOffice) {
      if (!form.email.trim()) { setError("Email is required for City Administrative Office users."); return; }
      const adminPhoneError = validateContactNumber(contactNumber);
      if (adminPhoneError) { setError(adminPhoneError); return; }
      if (!form.password || !form.confirmPassword) { setError("Password and confirm password are required."); return; }
      if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    } else {
      const officePhoneError = validateContactNumber(contactNumber);
      if (officePhoneError) { setError(officePhoneError); return; }
    }

    const payload = isAdministrativeOffice ? {
      full_name: `${firstName} ${lastName}`.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      contact_number: normalizedContactNumber,
      role: form.role.toLowerCase(),
      office,
    } : {
      full_name: `${firstName} ${lastName}`.trim(),
      contact_number: normalizedContactNumber,
      office,
    };

    const res=await fetch('/api/users.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!res.ok||!data.success){ setError(data.message||"Unable to create user."); return; }
    await loadUsers();
    resetForm();
  };
  const visibleUsers=users.filter(u=>`${u.name} ${u.email} ${u.office}`.toLowerCase().includes(search.toLowerCase()));
  const visibleOfficeStaff=officeStaff.filter(member=>member.office===selectedOffice&&`${member.fullName} ${member.contactNumber}`.toLowerCase().includes(search.toLowerCase()));
  const availableOffices=Array.from(new Set([
    ...users.map(user=>user.office),
    ...officeStaff.map(member=>member.office),
  ].filter(Boolean)));

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color:C.text }}>User Management</h2>
          <p className="text-sm mt-0.5" style={{ color:C.muted }}>
            Admin only · {selectedOffice===ADMINISTRATIVE_OFFICE?users.filter(user=>user.office===selectedOffice).length:officeStaff.filter(member=>member.office===selectedOffice).length} records
          </p>
        </div>
        <Btn size="large" onClick={()=>{
          if (showForm) resetForm();
          else { setForm(current=>({...current,office:selectedOffice})); setShowForm(true); }
        }}>{showForm?"× Cancel":"+ Add New User"}</Btn>
      </div>
      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Filter user records by office">
        {availableOffices.map(office=>{
          const count=office===ADMINISTRATIVE_OFFICE?users.filter(user=>user.office===office).length:officeStaff.filter(member=>member.office===office).length;
          const active=selectedOffice===office;
          return (
            <button key={office} type="button" role="tab" aria-selected={active} onClick={()=>{
              setSelectedOffice(office);
              if (showForm) setForm(current=>({...current,office}));
            }}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold border"
              style={{ borderColor:active?C.purple:C.border, color:active?C.purple:C.sub,
                background:active?`${C.purple}18`:C.card }}>
              {office} <span style={{ opacity:0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>
      {error&&<div className="rounded-xl px-4 py-2.5 mb-4 text-sm" style={{ background:`${C.red}18`, border:`1px solid ${C.red}33`, color:C.red }}>{error}</div>}
      {editingRole&&(
        <ModalOverlay onClose={()=>setEditingRole(null)}>
          <h3 className="text-lg font-bold mb-1" style={{ color:C.text }}>Edit User Role</h3>
          <p className="text-sm mb-4" style={{ color:C.muted }}>{editingRole.name} · {editingRole.office}</p>
          <Field size="large" label="Role"><TSelect size="large" options={["Staff","Admin"]} value={roleDraft} onChange={value=>setRoleDraft(value as "Admin"|"Staff")}/></Field>
          {roleError&&<p role="alert" className="text-sm mt-3" style={{ color:C.red }}>{roleError}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <Btn size="large" variant="ghost" onClick={()=>setEditingRole(null)}>Cancel</Btn>
            <Btn size="large" onClick={()=>void saveRole()}>Save Role</Btn>
          </div>
        </ModalOverlay>
      )}
      {editingOfficeStaff&&(
        <ModalOverlay onClose={()=>setEditingOfficeStaff(null)}>
          <h3 className="text-lg font-bold mb-1" style={{ color:C.text }}>Edit Office Staff</h3>
          <p className="text-sm mb-4" style={{ color:C.muted }}>Update this office contact's details.</p>
          <div className="space-y-3">
            <Field size="large" label="Full Name"><TInput size="large" value={officeStaffDraft.fullName} onChange={value=>setOfficeStaffDraft(current=>({...current,fullName:value}))}/></Field>
            <Field size="large" label="Contact Number"><TInput size="large" value={officeStaffDraft.contactNumber} onChange={value=>setOfficeStaffDraft(current=>({...current,contactNumber:value}))} placeholder="09xx xxx xxxx"/></Field>
            <Field size="large" label="Office"><TSelect size="large" options={availableOffices.filter(office=>office!==ADMINISTRATIVE_OFFICE)} value={officeStaffDraft.office} onChange={value=>setOfficeStaffDraft(current=>({...current,office:value}))}/></Field>
            <Field size="large" label="Status"><TSelect size="large" options={["Active","Inactive"]} value={officeStaffDraft.status} onChange={value=>setOfficeStaffDraft(current=>({...current,status:value}))}/></Field>
          </div>
          {officeStaffError&&<p role="alert" className="text-sm mt-3" style={{ color:C.red }}>{officeStaffError}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <Btn size="large" variant="ghost" onClick={()=>setEditingOfficeStaff(null)}>Cancel</Btn>
            <Btn size="large" onClick={()=>void saveOfficeStaff()}>Save Details</Btn>
          </div>
        </ModalOverlay>
      )}
      {showForm&&(
        <Card className="p-4 mb-4" style={{ border:`1px dashed ${C.purple}50` }}>
          <p className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color:C.sub }}>Add New User</p>
          <div className="grid grid-cols-2 gap-3">
            <Field size="large" label="Which office do you add?"><TSelect size="large" options={availableOffices} value={form.office} onChange={v=>setForm({...form,office:v})} placeholder="Select office"/></Field>
          </div>
          {form.office && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              {isAdministrativeOffice ? (
                <>
                  <Field size="large" label="First Name"><TInput size="large" value={form.firstName} onChange={v=>setForm({...form,firstName:v})} placeholder="Enter first name"/></Field>
                  <Field size="large" label="Last Name"><TInput size="large" value={form.lastName} onChange={v=>setForm({...form,lastName:v})} placeholder="Enter last name"/></Field>
                  <Field size="large" label="Email"><TInput size="large" type="email" value={form.email} onChange={v=>setForm({...form,email:v})} placeholder="user@city.gov.ph"/></Field>
                  <Field size="large" label="Contact Number"><TInput size="large" value={form.contactNumber} onChange={v=>setForm({...form,contactNumber:v})} placeholder="09xx xxx xxxx"/></Field>
                  <Field size="large" label="Role"><TSelect size="large" options={["Staff","Admin"]} value={form.role} onChange={v=>setForm({...form,role:v})} placeholder="Select role"/></Field>
                  <Field size="large" label="Password"><TInput size="large" type="password" value={form.password} onChange={v=>setForm({...form,password:v})} placeholder="Create password"/></Field>
                  <Field size="large" label="Confirm Password"><TInput size="large" type="password" value={form.confirmPassword} onChange={v=>setForm({...form,confirmPassword:v})} placeholder="Confirm password"/></Field>
                </>
              ) : (
                <>
                  <Field size="large" label="First Name"><TInput size="large" value={form.firstName} onChange={v=>setForm({...form,firstName:v})} placeholder="Enter first name"/></Field>
                  <Field size="large" label="Last Name"><TInput size="large" value={form.lastName} onChange={v=>setForm({...form,lastName:v})} placeholder="Enter last name"/></Field>
                  <Field size="large" label="Contact Number"><TInput size="large" value={form.contactNumber} onChange={v=>setForm({...form,contactNumber:v})} placeholder="09xx xxx xxxx"/></Field>
                </>
              )}
            </div>
          )}
          <div className="flex gap-3 mt-4 pt-3" style={{ borderTop:`1px solid ${C.border}` }}>
            <Btn size="large" onClick={createUser}>✓ Create User</Btn>
            <Btn size="large" variant="ghost" onClick={resetForm}>Cancel</Btn>
          </div>
        </Card>
      )}
      <Card>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor:C.border }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…" className="rounded-lg px-3 py-2 text-sm border outline-none w-56"
            style={{ background:C.card2, borderColor:C.border, color:C.text }}/>
          <span className="text-sm ml-auto" style={{ color:C.muted }}>
            {selectedOffice===ADMINISTRATIVE_OFFICE?visibleUsers.filter(user=>user.office===selectedOffice).length:visibleOfficeStaff.length} records
          </span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {(selectedOffice===ADMINISTRATIVE_OFFICE
                ?["Name","Email","Contact Number","Office","Role","Status","Last Login","Actions"]
                :["Name","Contact Number","Office","Status","Actions"]).map(h=>(
                <th key={h} className="text-left px-4 py-3 text-sm font-semibold" style={{ color:C.muted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedOffice===ADMINISTRATIVE_OFFICE&&visibleUsers.filter(user=>user.office===selectedOffice).map(u=>{
              const style=ss(u.status);
              return (
                <tr key={u.id} className="hover:bg-black/5" style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color:C.text }}>{u.name}</td>
                  <td className="px-4 py-3 text-sm" style={{ color:C.muted }}>{u.email}</td>
                  <td className="px-4 py-3 text-sm" style={{ color:C.muted }}>{u.contactNumber||"—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color:C.sub }}>{u.office||"—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm px-2.5 py-1 rounded-full font-semibold"
                      style={{ color:u.role==="Admin"?C.purple:C.sub,
                        background:u.role==="Admin"?`${C.purple}22`:`${C.sub}18` }}>{u.role}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm px-2.5 py-1 rounded-full font-semibold"
                      style={{ color:style.color, background:style.bg }}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color:C.muted }}>{u.lastLogin}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      <button onClick={()=>{setEditingRole(u);setRoleDraft(u.role);setRoleError("");}}
                        className="text-sm px-3 py-1.5 rounded border whitespace-nowrap"
                        style={{ borderColor:C.border, color:C.sub }}>Edit Role</button>
                      <button onClick={()=>toggle(u)} className="text-sm px-3 py-1.5 rounded border whitespace-nowrap"
                        style={{ borderColor:u.status==="Active"?"rgba(239,68,68,0.3)":"rgba(16,185,129,0.3)",
                          color:u.status==="Active"?C.red:C.green }}>
                        {u.status==="Active"?"Deactivate":"Activate"}
                      </button>
                      <button onClick={()=>remove(u.id)}
                        className="text-sm px-3 py-1.5 rounded border whitespace-nowrap"
                        style={{ borderColor:"rgba(239,68,68,0.2)", color:C.red }}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {selectedOffice!==ADMINISTRATIVE_OFFICE&&visibleOfficeStaff.map(member=>{
              const style=ss(member.status);
              return (
                <tr key={`office-staff-${member.id}`} className="hover:bg-black/5" style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color:C.text }}>{member.fullName}</td>
                  <td className="px-4 py-3 text-sm" style={{ color:C.muted }}>{member.contactNumber}</td>
                  <td className="px-4 py-3 text-sm" style={{ color:C.sub }}>{member.office}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm px-2.5 py-1 rounded-full font-semibold" style={{ color:style.color, background:style.bg }}>{member.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      <button onClick={()=>{
                        setEditingOfficeStaff(member);
                        setOfficeStaffDraft({fullName:member.fullName,contactNumber:member.contactNumber,office:member.office,status:member.status});
                        setOfficeStaffError("");
                      }} className="text-sm px-3 py-1.5 rounded border whitespace-nowrap"
                        style={{ borderColor:C.border, color:C.sub }}>Edit</button>
                      <button onClick={()=>void removeOfficeStaff(member.id)} className="text-sm px-3 py-1.5 rounded border whitespace-nowrap"
                        style={{ borderColor:"rgba(239,68,68,0.2)", color:C.red }}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {((selectedOffice===ADMINISTRATIVE_OFFICE&&!visibleUsers.some(user=>user.office===selectedOffice))||
              (selectedOffice!==ADMINISTRATIVE_OFFICE&&visibleOfficeStaff.length===0))&&(
              <tr><td colSpan={selectedOffice===ADMINISTRATIVE_OFFICE?8:5} className="px-4 py-8 text-center text-sm" style={{ color:C.muted }}>No records found for this office.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

type SettingsTab = "offices"|"funds"|"types"|"signatures"|"appearance";

function ThemePreviewThumbnail({ isDarkTheme }:{ isDarkTheme:boolean }) {
  const bg       = isDarkTheme ? "#0B0E1A" : "#F5F6FA";
  const sidebar  = isDarkTheme ? "#0D1021" : "#FFFFFF";
  const card     = isDarkTheme ? "#141827" : "#FFFFFF";
  const border   = isDarkTheme ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textLine = isDarkTheme ? "#E8EAF2" : "#1A1D2B";
  const mutedLine= isDarkTheme ? "#6B7494" : "#9CA0B4";
  const purple   = "#6C4FF5";

  return (
    <div style={{ width:"100%", height:140, background:bg, position:"relative", overflow:"hidden", borderRadius:"12px 12px 0 0" }}>
      {/* Sidebar strip */}
      <div style={{ position:"absolute", left:0, top:0, bottom:0, width:44,
        background:sidebar, borderRight:`1px solid ${border}` }}>
        {[0,1,2,3,4].map(i=>(
          <div key={i} style={{ height:5, borderRadius:3, margin:i===0?"14px 8px 0":"8px 8px 0",
            background:i===0?purple:mutedLine, opacity:i===0?1:0.25 }}/>
        ))}
      </div>
      {/* Header strip */}
      <div style={{ position:"absolute", left:44, right:0, top:0, height:28,
        background:sidebar, borderBottom:`1px solid ${border}` }}>
        <div style={{ position:"absolute", right:8, top:6, width:14, height:14,
          borderRadius:"50%", background:purple, opacity:0.7 }}/>
      </div>
      {/* Stat cards */}
      <div style={{ position:"absolute", left:52, right:6, top:36, display:"flex", gap:4 }}>
        {[purple,"#3B82F6","#10B981","#F59E0B"].map((color,i)=>(
          <div key={i} style={{ flex:1, height:30, borderRadius:6, background:card,
            border:`1px solid ${border}`, padding:"4px 5px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:color, marginBottom:3 }}/>
            <div style={{ height:2, borderRadius:1, background:textLine, width:"70%", marginBottom:2 }}/>
            <div style={{ height:2, borderRadius:1, background:mutedLine, width:"45%" }}/>
          </div>
        ))}
      </div>
      {/* Mini table */}
      <div style={{ position:"absolute", left:52, right:6, top:76, borderRadius:6,
        overflow:"hidden", border:`1px solid ${border}` }}>
        <div style={{ height:9, background:"#0D1021" }}/>
        {[0,1,2].map(i=>(
          <div key={i} style={{ height:7, background:i%2===0?"#FFFFFF":"#F7F8FC",
            borderBottom:"1px solid #E2E8F0" }}/>
        ))}
      </div>
      {/* Stepper row */}
      <div style={{ position:"absolute", left:52, right:6, bottom:6,
        display:"flex", alignItems:"center", gap:3 }}>
        {["CA","CTO","CBO","CAO","✓"].map((code,i)=>(
          <div key={code} style={{ display:"flex", alignItems:"center", flex:i<4?"1 1 0":"0 0 auto" }}>
            {i>0&&<div style={{ flex:1, height:1.5, background:i<2?"#10B981":border }}/>}
            <div style={{ width:12, height:12, borderRadius:"50%", flexShrink:0,
              background:i<2?"#10B981":card, border:i<2?"none":`1px solid ${border}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:5, fontWeight:700, color:i<2?"#fff":mutedLine }}>
              {i<2?code.slice(0,1):i===4?"✓":code.slice(0,1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Settings({ catalog, setCatalog, setDocs, loadError }:{
  catalog:CatalogData;
  setCatalog:React.Dispatch<React.SetStateAction<CatalogData>>;
  setDocs:React.Dispatch<React.SetStateAction<DocRecord[]>>;
  loadError:string;
}) {
  const C=useC();
  const { theme, setTheme }=useTheme();
  const [tab,setTab]=useState<SettingsTab>("offices");
  const tabs:{ id:SettingsTab; label:string }[]=[
    { id:"offices",    label:"Office List" },
    { id:"funds",      label:"Fund List"   },
    { id:"types",      label:"Document Type" },
    { id:"signatures", label:"Signature List" },
    { id:"appearance", label:"Appearance"  },
  ];
  const listData:Record<Exclude<SettingsTab,"appearance">,string[]> = catalog;
  const [editing,setEditing]=useState<{key:CatalogKey;index:number}|null>(null);
  const [showAdd,setShowAdd]=useState(false), [newItem,setNewItem]=useState(""), [signatureAcronym,setSignatureAcronym]=useState(""), [signatureName,setSignatureName]=useState(""), [catalogError,setCatalogError]=useState(""), [catalogLoading,setCatalogLoading]=useState(false);
  const saveItem=async(key:CatalogKey,index:number,value:string)=>{
    const name=value.trim(), oldName=catalog[key][index];
    if(!name) return;
    setCatalogLoading(true); setCatalogError("");
    try {
      const response=await fetch(`/api/catalog.php?type=${key}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({old_name:oldName,name})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) {
        setCatalogError(data.message||"Unable to update this item in the XAMPP database.");
        return;
      }
      setCatalog(current=>({...current,[key]:current[key].map((item,itemIndex)=>itemIndex===index?name:item)}));
      if(key==="signatures") {
        setDocs(current=>current.map(doc=>doc.signature===oldName?{...doc,signature:name}:doc));
      }
      setEditing(null);
    } catch {
      setCatalogError("Unable to connect to the XAMPP database.");
    } finally {
      setCatalogLoading(false);
    }
  };
  const addItem=async()=>{
    const key=tab as CatalogKey;
    const name=key==="signatures"
      ? `${signatureAcronym.trim()} – ${signatureName.trim()}`
      : newItem.trim();
    if(!name) { setCatalogError("Enter a name before saving."); return; }
    if(key==="signatures"&&(!signatureAcronym.trim()||!signatureName.trim())) {
      setCatalogError("Enter both the acronym and the real name."); return;
    }
    setCatalogLoading(true); setCatalogError("");
    try {
      const response=await fetch(`/api/catalog.php?type=${key}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) {
        setCatalogError(data.message||"Unable to save this item to the XAMPP database.");
        return;
      }
      setCatalog(current=>({...current,[key]:[...current[key],data.name||name]}));
      setNewItem(""); setSignatureAcronym(""); setSignatureName(""); setShowAdd(false);
    } catch { setCatalogError("Unable to connect to the XAMPP database."); }
    finally { setCatalogLoading(false); }
  };
  const removeItem=async(key:CatalogKey,index:number)=>{
    const oldName=catalog[key][index];
    if(!window.confirm("Remove this item from future selections?")) return;
    try {
      const response=await fetch(`/api/catalog.php?type=${key}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({old_name:oldName})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) {
        setCatalogError(data.message||"Unable to delete this item from the XAMPP database.");
        return;
      }
      setCatalog(current=>({...current,[key]:current[key].filter(item=>item!==oldName)}));
    } catch {
      setCatalogError("Unable to connect to the XAMPP database.");
    }
  };

  return (
    <div className="p-5">
      {showAdd&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-enter" style={{ background:"rgba(0,0,0,0.65)" }}>
          <div className="w-full max-w-md rounded-2xl p-5 modal-panel-enter" style={{ background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-sm font-bold" style={{ color:C.text }}>Add {tabs.find(t=>t.id===tab)?.label}</h3><p className="text-xs mt-1" style={{ color:C.muted }}>This item will be saved to the XAMPP database.</p></div>
              <button onClick={()=>{setShowAdd(false);setCatalogError("");}} style={{ color:C.muted }}>×</button>
            </div>
            {tab==="signatures"?(
              <div className="space-y-3">
                <Field label="Acronym"><TInput value={signatureAcronym} onChange={setSignatureAcronym} placeholder="e.g. CA" /></Field>
                <Field label="Real Name"><TInput value={signatureName} onChange={setSignatureName} placeholder="e.g. City Administrative" /></Field>
                <p className="text-xs" style={{ color:C.muted }}>
                  Saved as: {signatureAcronym.trim()&&signatureName.trim()?`${signatureAcronym.trim()} – ${signatureName.trim()}`:"—"}
                </p>
              </div>
            ):(
              <TInput value={newItem} onChange={setNewItem} placeholder="Enter item name" />
            )}
            <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop:`1px solid ${C.border}` }}>
              <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
              <Btn disabled={catalogLoading} onClick={()=>void addItem()}>{catalogLoading?"Saving...":"Save Item"}</Btn>
            </div>
          </div>
        </div>
      )}
      <div className="mb-5">
        <h2 className="text-base font-bold" style={{ color:C.text }}>Settings</h2>
        <p className="text-xs mt-0.5" style={{ color:C.muted }}>Admin only · Manage system lists and appearance</p>
      </div>
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background:C.card }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold"
            style={{ background:tab===t.id?C.purple:"transparent", color:tab===t.id?"#fff":C.muted }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="appearance" ? (
        <div className="space-y-6 max-w-xl">
          {/* Section header */}
          <div>
            <h3 className="text-sm font-bold" style={{ color:C.text }}>Appearance</h3>
            <p className="text-xs mt-0.5" style={{ color:C.muted }}>Choose how ADTRAQS looks to you.</p>
          </div>

          {/* Theme cards */}
          <div className="flex gap-4">
            {([
              { label:"Dark Mode", isDark:true  },
              { label:"Light Mode",isDark:false },
            ]).map(opt=>{
              const isSelected=(theme==="dark")===opt.isDark;
              return (
                <button key={opt.label} onClick={()=>setTheme(opt.isDark?"dark":"light")}
                  className="flex-1 rounded-2xl overflow-hidden text-left"
                  style={{ border:`2px solid ${isSelected?C.purple:C.border}`,
                    background:"transparent", padding:0, cursor:"pointer",
                    boxShadow:isSelected?`0 0 0 4px ${C.purple}22`:"none",
                    position:"relative" }}>
                  <ThemePreviewThumbnail isDarkTheme={opt.isDark}/>
                  <div style={{ padding:"10px 14px", background:C.card, borderTop:`1px solid ${C.border}`,
                    display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize:14 }}>{opt.isDark?"🌙":"☀️"}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{opt.label}</span>
                    </div>
                    {isSelected&&(
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99,
                        background:C.purple, color:"#fff" }}>✓ Active</span>
                    )}
                  </div>
                  {isSelected&&(
                    <div style={{ position:"absolute", top:8, right:8, width:22, height:22,
                      borderRadius:"50%", background:C.purple, display:"flex", alignItems:"center",
                      justifyContent:"center", fontSize:11, color:"#fff", fontWeight:700,
                      boxShadow:"0 2px 8px rgba(108,79,245,0.4)" }}>✓</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick toggle */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color:C.text }}>Dark Mode</p>
                <p className="text-xs mt-0.5" style={{ color:C.muted }}>
                  {theme==="dark"?"Currently using dark theme":"Currently using light theme"}
                </p>
              </div>
              <Toggle checked={theme==="dark"} onChange={v=>setTheme(v?"dark":"light")}/>
            </div>
          </Card>

          {/* Note */}
          <div className="rounded-xl px-4 py-3 text-xs"
            style={{ background:`${C.blue}12`, border:`1px solid ${C.blue}30`, color:C.blue }}>
            ℹ Changes apply immediately. Other screens (Edit modal, Reports, Office/Processor mini-systems) will be extended to full light-mode parity in development.
          </div>
        </div>
      ) : (
        <>
        {(loadError||catalogError)&&<div role="alert" className="rounded-xl px-4 py-2.5 mb-4 text-xs"
          style={{ background:`${C.red}18`, border:`1px solid ${C.red}33`, color:C.red }}>{catalogError||loadError}</div>}
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor:C.border }}>
            <span className="text-xs font-semibold" style={{ color:C.text }}>
              {tabs.find(t=>t.id===tab)?.label}
            </span>
            <Btn onClick={()=>{setNewItem("");setCatalogError("");setShowAdd(true)}}>+ Add Item</Btn>
          </div>
          <div className="p-4 space-y-2">
            {(listData[tab as keyof typeof listData]??[]).map((item,i)=>(
              <div key={`${tab}-${i}`} className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
                style={{ background:C.card2, borderColor:C.border }}>
                {editing?.key===tab&&editing.index===i
                  ?<input autoFocus defaultValue={item} onKeyDown={event=>{if(event.key==="Enter") void saveItem(tab as CatalogKey,i,event.currentTarget.value);}}
                    className="rounded px-2 py-1 text-xs border outline-none"
                    style={{ background:C.card, borderColor:C.border, color:C.text }} />
                  :<span className="text-xs" style={{ color:C.text }}>{item}</span>}
                <div className="flex gap-2">
                  {editing?.key===tab&&editing.index===i
                    ?<button onClick={event=>{const input=event.currentTarget.parentElement?.parentElement?.querySelector("input"); if(input) void saveItem(tab as CatalogKey,i,(input as HTMLInputElement).value);}} className="text-xs px-2 py-0.5 rounded border"
                      style={{ borderColor:`${C.green}66`, color:C.green }}>✓ Save</button>
                    :<button onClick={()=>setEditing({key:tab as CatalogKey,index:i})} className="text-xs px-2 py-0.5 rounded border"
                      style={{ borderColor:C.border, color:C.sub }}>✎ Edit</button>}
                  <button onClick={()=>void removeItem(tab as CatalogKey,i)} className="text-xs px-2 py-0.5 rounded border"
                    style={{ borderColor:"rgba(239,68,68,0.3)", color:C.red }}>× Remove</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        </>
      )}
    </div>
  );
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────

function Profile({ user, setUser, onLogout }:{ user:AuthUser; setUser:(user:AuthUser)=>void; onLogout:()=>void }) {
  const C=useC();
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({name:user.fullName,email:user.email,username:user.username||"",contactNumber:user.contactNumber||"",currentPassword:"",newPassword:""});
  const [message,setMessage]=useState("");
  const cancelEditing=()=>{
    setForm({name:user.fullName,email:user.email,username:user.username||"",contactNumber:user.contactNumber||"",currentPassword:"",newPassword:""});
    setEditing(false);
    setMessage("");
  };
  useEffect(()=>{
    let cancelled=false;
    fetch('/api/users.php',{cache:'no-store'}).then(response=>response.json()).then(data=>{
      const account=(data.users??[]).find((candidate:UserRow)=>candidate.id===user.id);
      if (cancelled||!account) return;
      const contactNumber=account.contactNumber||"";
      setForm(current=>({...current,contactNumber}));
      setUser({...user,fullName:account.name,email:account.email,contactNumber});
    }).catch(error=>console.error('Unable to reload profile details',error));
    return()=>{cancelled=true;};
  },[user.id]);
  const save=async()=>{
    setMessage("");
    const contactNumber=form.contactNumber.replace(/\D/g,"");
    if (!/^\d{11}$/.test(contactNumber)) { setMessage("Contact number must be exactly 11 digits."); return; }
    const res=await fetch('/api/users.php',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id,full_name:form.name,email:form.email,username:form.username,contact_number:contactNumber,current_password:form.currentPassword,new_password:form.newPassword})});
    const data=await res.json();
    if(!res.ok||!data.success){setMessage(data.message||"Unable to update profile.");return;}
    setUser({...user,fullName:form.name,email:form.email,username:form.username,contactNumber}); setForm({...form,contactNumber,currentPassword:"",newPassword:""}); setEditing(false); setMessage("Profile updated successfully.");
  };
  return (
    <div className="p-5 max-w-3xl">
      <div className="mb-5">
        <h2 className="text-base font-bold" style={{ color:C.text }}>Profile</h2>
        <p className="text-xs mt-1" style={{ color:C.muted }}>Your account and contact information</p>
      </div>
      <Card className="overflow-hidden">
        <div className="p-6 flex flex-wrap items-center gap-4 border-b" style={{ borderColor:C.border, background:C.card2 }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
            style={{ background:C.purple, color:"#fff" }}>{user.fullName.trim().charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold truncate" style={{ color:C.text }}>{user.fullName}</p>
            <p className="text-xs mt-1" style={{ color:C.sub }}>{user.role==="admin"?"Administrator":"Staff"} · {user.office}</p>
            <p className="text-xs mt-1 font-mono" style={{ color:C.muted }}>{user.email}</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background:user.status.toLowerCase()==="active"?`${C.green}18`:C.card, color:user.status.toLowerCase()==="active"?C.green:C.muted }}>
            {user.status}
          </span>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase" style={{ color:C.sub }}>Account details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <Field label="Full Name"><TInput value={form.name} readOnly={!editing} onChange={value=>setForm({...form,name:value})}/></Field>
              <Field label="Username"><TInput value={form.username} readOnly={!editing} onChange={value=>setForm({...form,username:value})}/></Field>
              <Field label="Email"><TInput type="email" value={form.email} readOnly={!editing} onChange={value=>setForm({...form,email:value})}/></Field>
              <Field label="Contact Number"><TInput type="tel" value={form.contactNumber} readOnly={!editing}
                onChange={value=>setForm({...form,contactNumber:value.replace(/\D/g,"").slice(0,11)})} placeholder="11-digit contact number"/></Field>
              <Field label="Role"><TInput value={user.role==="admin"?"Admin":"Staff"} readOnly/></Field>
              <Field label="Office"><TInput value={user.office} readOnly/></Field>
            </div>
          </div>
          {editing&&(
            <div className="pt-4 border-t" style={{ borderColor:C.border }}>
              <h3 className="text-xs font-semibold uppercase mb-3" style={{ color:C.sub }}>Confirm changes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Current Password"><TInput type="password" value={form.currentPassword} onChange={value=>setForm({...form,currentPassword:value})}/></Field>
                <Field label="New Password (optional)"><TInput type="password" value={form.newPassword} onChange={value=>setForm({...form,newPassword:value})}/></Field>
              </div>
            </div>
          )}
          {message&&<p role="status" className="text-xs" style={{color:message.includes("success")?C.green:C.red}}>{message}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {editing?(
              <><Btn onClick={()=>void save()}>Save Changes</Btn><Btn variant="ghost" onClick={cancelEditing}>Cancel</Btn></>
            ):(
              <><Btn onClick={()=>setEditing(true)}>✎ Edit Profile</Btn>
                <button onClick={onLogout} className="px-4 py-2 rounded-lg text-xs font-semibold border"
                  style={{ borderColor:"rgba(239,68,68,0.4)", color:C.red, background:`${C.red}10` }}>⎋ Logout</button></>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function OfficePortalApp() {
  const mode=getOfficePortalMode();
  const initialControlNumber=new URLSearchParams(window.location.search).get("control")??undefined;
  const [docs,setDocs]=useState<DocRecord[]>([]);
  const [tracking,setTracking]=useState<TrackingRecord[]>([]);
  const [groupTracking,setGroupTracking]=useState<GroupTrackingRecord[]>([]);
  const [theme,setTheme]=useState<Theme>("light");
  const [refreshing,setRefreshing]=useState(false);
  const [initialDataLoaded,setInitialDataLoaded]=useState(false);

  useEffect(()=>{
    const context=mode==="processor"?"Processor":mode?MODE_OFFICE_NAME[mode]:"";
    document.title=context?`ADTRAQS - ${context}`:"ADTRAQS";
  },[mode]);

  const refreshData=async()=>{
    setRefreshing(true);
    try {
      const [docsRes,trackingRes,groupsRes]=await Promise.all([
        fetch('/api/docs.php',{cache:'no-store'}),
        fetch('/api/tracking.php',{cache:'no-store'}),
        fetch('/api/group-tracking.php',{cache:'no-store'}),
      ]);
      if (docsRes.ok) {
        const data=await docsRes.json();
        if (data.success) setDocs(data.docs??[]);
      }
      if (trackingRes.ok) {
        const data=await trackingRes.json();
        if (data.success) setTracking(data.tracking??[]);
      }
      if (groupsRes.ok) {
        const data=await groupsRes.json();
        if (data.success) setGroupTracking(data.groups??[]);
      }
    } catch(error) {
      console.error('Failed to refresh office portal data',error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(()=>{
    void refreshData().finally(()=>setInitialDataLoaded(true));
  },[]);
  useEffect(()=>{
    const refreshTracking=async()=>{
      try {
        const [response,groupsResponse]=await Promise.all([
          fetch('/api/tracking.php',{cache:'no-store'}),
          fetch('/api/group-tracking.php',{cache:'no-store'}),
        ]);
        if (response.ok) {
          const data=await response.json();
          if (data.success) setTracking(data.tracking??[]);
        }
        if (groupsResponse.ok) {
          const data=await groupsResponse.json();
          if (data.success) setGroupTracking(data.groups??[]);
        }
      } catch(error) {
        console.error('Failed to refresh tracking data',error);
      }
    };
    const interval=window.setInterval(refreshTracking,2000);
    return()=>window.clearInterval(interval);
  },[]);

  if (mode==="processor") {
    return <ThemeCtx.Provider value={{theme,setTheme}}>
      <ProcessorMiniSystem docs={docs} trackingRecords={tracking} groupTrackingRecords={groupTracking}
        initialControlNumber={initialControlNumber} initialDataLoaded={initialDataLoaded}/>
    </ThemeCtx.Provider>;
  }
  if (mode && (mode === "office-ct" || mode === "office-cb" || mode === "office-ca")) {
    return <ThemeCtx.Provider value={{theme,setTheme}}>
      <OfficeMiniSystem mode={mode} docs={docs} trackingRecords={tracking} groupTrackingRecords={groupTracking} setDocs={setDocs} setTrackingRecords={setTracking} setGroupTrackingRecords={setGroupTracking}
        onRefresh={refreshData} refreshing={refreshing}/>
    </ThemeCtx.Provider>;
  }

  return <ThemeCtx.Provider value={{theme,setTheme}}>
    <AuthBg backgroundImage={loginBackdropImg}>
      <AuthCard className="w-full max-w-sm text-center">
        <GingoogSeal size={72}/>
        <h1 className="mt-4 text-lg font-bold" style={{color:theme==="dark"?"#fff":"#1A1D2B"}}>Use your assigned office link</h1>
        <p className="mt-2 text-sm" style={{color:theme==="dark"?"rgba(255,255,255,0.65)":"#5C6178"}}>
          This page is for office and processor tracking links.
        </p>
      </AuthCard>
    </AuthBg>
  </ThemeCtx.Provider>;
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [savedSession]=useState(readSavedAppSession);
  const [appState,setAppState]=useState<"login"|"signup"|"app">(savedSession?"app":"login");
  const [role,setRole]        =useState<Role>(savedSession?.role??"admin");
  const [user,setUser]        =useState<AuthUser|null>(savedSession?.user??null);
  const [screen,setScreen]    =useState<AppScreen>(savedSession?.screen??"dashboard");
  const [docs,setDocs]        =useState<DocRecord[]>([]);
  const [tracking,setTracking]=useState<TrackingRecord[]>([]);
  const [groupTracking,setGroupTracking]=useState<GroupTrackingRecord[]>([]);
  const [trackingToView,setTrackingToView]=useState<string|null>(null);
  const [documentToView,setDocumentToView]=useState<string|null>(null);
  const [catalog,setCatalog]=useState<CatalogData>({ offices:[], funds:[], types:[], signatures:[] });
  const [catalogLoadError,setCatalogLoadError]=useState("");
  const [theme,setTheme]      =useState<Theme>(savedSession?.theme??"light");
  const notifications=getTrackingNotifications(tracking);

  useEffect(()=>{
    document.title="ADTRAQS";
  },[appState,role,user]);

  useEffect(()=>{
    if (appState==="app"&&user) {
      saveAppSession({user,role,screen,theme});
    } else if (appState==="login") {
      clearSavedAppSession();
    }
  },[appState,role,user,screen,theme]);

  const reloadApp=()=>{
    if (appState==="app"&&user&&!saveAppSession({user,role,screen,theme})) {
      alert("Unable to preserve your sign-in for refresh. Please check browser storage settings and try again.");
      return;
    }
    window.location.reload();
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [docsRes, trackingRes, groupsRes] = await Promise.all([
          apiFetch('/api/docs', { cache:'no-store' }),
          apiFetch('/api/tracking', { cache:'no-store' }),
          apiFetch('/api/group-tracking.php', { cache:'no-store' }),
        ]);

        if (docsRes.ok) {
          const docsData = await docsRes.json();
          setDocs(docsData.docs ?? []);
        } else {
          setDocs([]);
        }

        if (trackingRes.ok) {
          const trackingData = await trackingRes.json();
          setTracking(trackingData.tracking ?? []);
        } else {
          setTracking([]);
        }

        if (groupsRes.ok) {
          const groupsData = await groupsRes.json();
          setGroupTracking(groupsData.groups ?? []);
        } else {
          setGroupTracking([]);
        }
      } catch (error) {
        console.error('Failed to load app data', error);
        setDocs([]);
        setTracking([]);
        setGroupTracking([]);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    loadCatalog()
      .then(data=>{ setCatalog(data); setCatalogLoadError(""); })
      .catch(error=>{
        console.error('Failed to load catalog data',error);
        setCatalogLoadError(error.message||"Unable to load catalog data from XAMPP.");
      });
  }, []);

  useEffect(() => {
    const refreshTracking=async()=>{
      try {
        const [response,groupsResponse]=await Promise.all([
          apiFetch('/api/tracking', { cache:'no-store' }),
          apiFetch('/api/group-tracking.php', { cache:'no-store' }),
        ]);
        if (response.ok) {
          const data=await response.json();
          if (data.success !== false) setTracking(data.tracking ?? []);
        }
        if (groupsResponse.ok) {
          const data=await groupsResponse.json();
          if (data.success !== false) setGroupTracking(data.groups ?? []);
        }
      } catch (error) {
        console.error('Failed to refresh tracking data', error);
      }
    };
    const interval=window.setInterval(refreshTracking,2000);
    const onFocus=()=>void refreshTracking();
    window.addEventListener('focus',onFocus);
    return()=>{ window.clearInterval(interval); window.removeEventListener('focus',onFocus); };
  }, []);

  if (appState==="login") return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <LoginScreen
        onLogin={async (u,p)=>{
          try {
            const res = await apiFetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: u, password: p }),
            });
            const result = await res.json();

            if (!res.ok || !(result.success ?? result.ok)) {
              alert(result.message || 'Login failed.');
              return;
            }

            const userRecord = result.user ?? {};
            setRole(userRecord.role === 'admin' ? 'admin' : 'staff');
            const contactNumber=String(userRecord.contact_number??userRecord.contactNumber??'').replace(/\D/g,'');
            setUser({id:userRecord.id,fullName:userRecord.full_name ?? userRecord.fullName ?? 'User',email:userRecord.email,username:userRecord.username ?? '',role:userRecord.role === 'admin' ? 'admin' : 'staff',office:userRecord.office ?? 'CHO',status:userRecord.status ?? 'Active',position:userRecord.position ?? '',contactNumber});
            setAppState('app');
            setScreen('dashboard');
          } catch (error) {
            console.error('Login failed', error);
            alert('Unable to connect to the backend server.');
          }
        }}
        onGoSignup={()=>setAppState("signup")}/>
    </ThemeCtx.Provider>
  );

  if (appState==="signup") return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <SignUpScreen onBack={()=>setAppState("login")} offices={catalog.offices}/>
    </ThemeCtx.Provider>
  );

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <AppShell screen={screen} setScreen={setScreen} role={role} user={user}
        onRefresh={reloadApp} refreshing={false} notifications={notifications}
        onLogout={()=>{ clearSavedAppSession(); setUser(null); setAppState("login"); setScreen("dashboard"); }}>
        {screen==="dashboard"            &&user&&        <Dashboard role={role} setScreen={setScreen} docs={docs} trackingRecords={tracking} groupTrackingRecords={groupTracking} user={user} catalog={catalog}/>}
        {screen==="document-tracker"     &&<DocumentTracker role={role} user={user} docs={docs} trackingRecords={tracking} groupTrackingRecords={groupTracking} catalog={catalog} setDocs={setDocs} setTracking={setTracking} setGroupTrackingRecords={setGroupTracking}
          openDocumentId={documentToView??undefined} onOpenDocumentHandled={()=>setDocumentToView(null)}
          onViewTracking={id=>{ setDocumentToView(null); setTrackingToView(id); setScreen("tracking-monitoring"); }}/ >}
        {screen==="tracking-monitoring"  &&<TrackingMonitoring trackingRecords={tracking} setTrackingRecords={setTracking} groupTrackingRecords={groupTracking} setGroupTrackingRecords={setGroupTracking} docs={docs} setDocs={setDocs} role={role} user={user}
          onViewDocument={id=>{ setDocumentToView(id); setScreen("document-tracker"); }} initialTrackingId={trackingToView??undefined}
          onInitialTrackingHandled={()=>setTrackingToView(null)}/ >}
        {screen==="reports"              &&<Reports docs={docs} catalog={catalog} trackingRecords={tracking} groupTrackingRecords={groupTracking}/>}
        {screen==="user-management"     &&<UserManagement/>}
        {screen==="settings"             &&<Settings catalog={catalog} setCatalog={setCatalog} setDocs={setDocs} loadError={catalogLoadError}/>}
        {screen==="profile"              &&user&&<Profile user={user} setUser={setUser} onLogout={()=>{ clearSavedAppSession(); setUser(null); setAppState("login"); setScreen("dashboard"); }}/>}
      </AppShell>
    </ThemeCtx.Provider>
  );
}
