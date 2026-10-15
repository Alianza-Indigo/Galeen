"use client";
import { useEffect, useState } from "react";
type Section="overview"|"institutions"|"connections"|"people"|"usage"|"settings";
const nav: {key:Section;label:string;icon:string}[]=[
{key:"overview",label:"Resumen",icon:""},{key:"institutions",label:"Instituciones",icon:""},{key:"connections",label:"Proveedores de IA",icon:""},{key:"people",label:"Usuarios y roles",icon:""},{key:"usage",label:"Consumo y cuotas",icon:""},{key:"settings",label:"Configuracin",icon:""}];
const titles: Record<Section,{title:string;desc:string}>={
overview:{title:"Centro de control",desc:"Una plataforma para administrar la IA de todas tus instituciones."},
institutions:{title:"Instituciones",desc:"Espacios independientes, marca blanca y administracin local."},
connections:{title:"Proveedores de IA",desc:"Cada institucin conecta y controla sus propios recursos."},
people:{title:"Usuarios y roles",desc:"Accesos, permisos y seguridad por organizacin."},
usage:{title:"Consumo y cuotas",desc:"Visibilidad real del uso de modelos, presupuestos y lmites."},
settings:{title:"Configuracin del sistema",desc:"Preparacin de infraestructura y puesta en produccin."}
};
function Mark(){return <div className="brand-mark"><span className="dot a"/><span className="dot b"/><span className="dot c"/><span className="dot d"/></div>}
function Empty({symbol,title,description,action}:{symbol:string;title:string;description:string;action?:string}){return <div className="empty"><sq^