"use strict";!function(){function t(t,i){if(t.left>=i.left&&t.right<=i.right&&t.top>=i.top&&t.bottom<=i.bottom)return 1;var e,o=t.width*t.height,n=t.width,r=t.height,f=0,h=t.left-i.left,l=i.right-t.right,u=t.top-i.top,c=i.bottom-t.bottom;return h<0&&(n+=h),l<0&&(n+=l),u<0&&(r+=u),c<0&&(r+=c),n<0&&(n=0),r<0&&(r=0),(e=n*r)===o?f=1:e<o&&(f=e/o),f}function i(){return window.karmaWindow||window}function e(){return window.karmaBody||document.body}function o(t){return Math.round(100*Number(t||0))/100}function n(t,i,e,n){this.top=o(i),this.height=o(n),this.bottom=o(this.top+this.height),this.left=o(t),this.width=o(e),this.right=o(this.left+this.width)}function r(){return i().pageYOffset||e().scrollTop}function f(){return i().pageXOffset||e().scrollLeft}function h(){var t=r()+c;return new n(f()+c,t,i().innerWidth-s,i().innerHeight-s)}function l(t,i){var e,o,h,l,u=t.getBoundingClientRect();return i?(e=i.left-u.left,o=i.top-u.top,h=i.width,l=i.height):(e=u.left,o=u.top,h=u.width,l=u.height),e+=f(),o+=r(),new n(e,o,h,l)}function u(t,i){var o,h,l,u,c,s=t.getBoundingClientRect();return c=t.isSameNode(e())&&!e().scrollLeft?e().getBoundingClientRect().left:0,i?(o=i.left,h=i.top,l=i.width,u=i.height):(o=0,h=0,l=0,u=0),o-=s.left+f(),o+=c,h-=s.top+r(),new n(o,h,l,u)}var c=0,s=2*c;FS.dialog.service.positioningObj={fp2:o,fsRect:n,fsCalculatePercentageVisible:t,windowTop:r,windowLeft:f,fsGetWindowRect:h,fsLocalToGlobal:l,fsGlobalToLocal:u,fsLocalToLocal:function(t,i,e){return e=e||null,e=l(t,e),u(i,e)}}}();