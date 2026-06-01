<?php

defined('FRONTPRESS_BOOT') || exit;
/** @var string $cmsRoot */
$appRoot         = dirname(__DIR__, 2);
$srcRoot         = $appRoot . '/src';
$adminAssetsRoot = $appRoot . '/admin/assets';
$vite            = new FrontPress\Vite($srcRoot, $adminAssetsRoot);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FrontPress Admin</title>
<?= $vite->tags('main.jsx') ?>
<style>
.fp-resize-handle{position:fixed;top:0;height:100vh;width:9px;z-index:50;cursor:col-resize;
  touch-action:none;background:transparent;transition:background .15s ease}
.fp-resize-handle::after{content:"";position:absolute;top:0;bottom:0;left:4px;width:1px;background:transparent}
.fp-resize-handle:hover::after,.fp-resize-handle.fp-dragging::after{background:#3b82f6}
.fp-resize-handle:hover,.fp-resize-handle.fp-dragging{background:rgba(59,130,246,.08)}
body.fp-resizing{cursor:col-resize;user-select:none}
</style>
</head>
<body>
<div id="root"></div>
<script>
/* Resizable admin side panels — runtime enhancement, decoupled from the
   React bundle (survives re-renders): inline width on the <aside>, a
   body-level fixed drag handle tracking its inner edge. localStorage-backed,
   double-click the handle to reset. Left nav = aside.border-r, right meta
   editor = aside.border-l. */
(function(){
  var PANELS=[
    {sel:"aside.border-r",edge:"right",key:"fp_nav_w", def:240,min:180,max:420},
    {sel:"aside.border-l",edge:"left", key:"fp_meta_w",def:288,min:240,max:680}
  ];
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function stored(p){var v=parseInt(localStorage.getItem(p.key),10);
    return (v&&!isNaN(v))?clamp(v,p.min,p.max):null;}
  function applyWidth(el,p){var w=stored(p); if(w){el.style.width=w+"px";el.style.flex="0 0 "+w+"px";}}
  PANELS.forEach(function(p){
    var handle=document.createElement("div");
    handle.className="fp-resize-handle";
    handle.title="Drag to resize · double-click to reset";
    handle.style.display="none";
    document.body.appendChild(handle);
    p._handle=handle;
    var dragging=false;
    function panel(){return document.querySelector(p.sel);}
    function reposition(){
      var el=panel();
      if(!el){handle.style.display="none";return;}
      var r=el.getBoundingClientRect();
      if(r.width===0){handle.style.display="none";return;}
      handle.style.display="block";
      handle.style.left=((p.edge==="right"?r.right:r.left)-4)+"px";
    }
    handle.addEventListener("pointerdown",function(e){
      var el=panel(); if(!el)return;
      dragging=true; handle.classList.add("fp-dragging");
      document.body.classList.add("fp-resizing");
      handle.setPointerCapture(e.pointerId); e.preventDefault();
    });
    handle.addEventListener("pointermove",function(e){
      if(!dragging)return;
      var el=panel(); if(!el)return;
      var r=el.getBoundingClientRect();
      var w=clamp(p.edge==="right"?(e.clientX-r.left):(r.right-e.clientX),p.min,p.max);
      el.style.width=w+"px"; el.style.flex="0 0 "+w+"px";
      reposition();
    });
    function endDrag(e){
      if(!dragging)return;
      dragging=false; handle.classList.remove("fp-dragging");
      document.body.classList.remove("fp-resizing");
      var el=panel();
      if(el){var w=Math.round(el.getBoundingClientRect().width);
        try{localStorage.setItem(p.key,w);}catch(x){}}
    }
    handle.addEventListener("pointerup",endDrag);
    handle.addEventListener("pointercancel",endDrag);
    handle.addEventListener("dblclick",function(){
      try{localStorage.removeItem(p.key);}catch(x){}
      var el=panel(); if(el){el.style.width="";el.style.flex="";}
      reposition();
    });
    p._reposition=reposition;
  });
  function tick(){
    PANELS.forEach(function(p){
      var el=document.querySelector(p.sel);
      if(el&&!el.dataset.fpResizable){el.dataset.fpResizable="1";applyWidth(el,p);}
      else if(el&&stored(p)&&!el.style.width){applyWidth(el,p);}
      p._reposition&&p._reposition();
    });
  }
  var mo=new MutationObserver(function(){tick();});
  function start(){
    var root=document.getElementById("root")||document.body;
    mo.observe(root,{childList:true,subtree:true});
    window.addEventListener("resize",tick,{passive:true});
    window.addEventListener("scroll",tick,{passive:true,capture:true});
    tick(); setInterval(tick,800);
  }
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",start);
  else start();
})();
</script>
</body>
</html>
