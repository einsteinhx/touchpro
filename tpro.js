var touch = touch || {};

(function (doc, exports) {
	
    var _OS = {
        regex: {
            android: /(Android)\s+([\d.]+)|Linux/,
            ipad: /(iPad).*OS\s([\d_]+)/,
            iphone: /(iPhone\sOS)\s([\d_]+)/
        },
        isAndroid: function () {
            return this.regex.android.test(navigator.userAgent);
        },
        isIPad: function () {
            return this.regex.ipad.test(navigator.userAgent);
        },
        isIPhone: function () {
            return this.regex.iphone.test(navigator.userAgent);
        }
    }
	
	var utils = {
		getType : function(obj){
			return Object.prototype.toString.call(obj).match(/\s([a-z|A-Z]+)/)[1].toLowerCase();
		},
		getSelector : function(el){
			if(el.id){return "#" + el.id;}
			if(el.className){
				var cns = el.className.split(/\s+/);
				return "." + cns.join(".");
			}else{
				return el.tagName.toLowerCase();
			}
		},
		matchSelector : function(target, selector){
			return target.webkitMatchesSelector(selector)
		},
		getEventListeners : function(el){
			return el.listeners;
		},
		hasTouch : function(){
			return ('ontouchstart' in window);
		}
	}
	
    /** 底层事件绑定/代理支持  */
	var proxyid = 0;
	var proxies = [];
    var _trigger = function (el, evt, detail) {
        var opt = {
            bubbles: true,
            cancelable: true,
            detail: detail || {}
        }
        var e = new CustomEvent(evt, opt);
        el && el.dispatchEvent(e);
    }

    /**
     * {DOM} element
     * {String} eventName
     * {Function} handler
     */
    var _bind = function (el, evt, handler) {
		el.listeners = el.listeners || {};
		if(!el.listeners[evt]){
			el.listeners[evt] = [handler];
		}else{
			el.listeners[evt].push(handler);
		}
		var proxy = function(e){
			e.originEvent = e;
			for(var p in e.detail){
				e[p] = e.detail[p]
			}
			handler.call(e.target, e);
		}
		
		handler.proxy = handler.proxy || {};
		if(!handler.proxy[evt]){
			handler.proxy[evt] = [proxyid++];
		}else{
			handler.proxy[evt].push(proxyid++);
		}
		proxies.push(proxy);
		
        el.addEventListener(evt, proxy, false);
    }

    /**
     * {DOM} element
     * {String} eventName
     * {Function} the same handler of _bind
     */
    var _unbind = function (el, evt, handler) {
		if(!handler){
			var handlers = el.listeners[evt];
			if(handlers.length){
				handlers.forEach(function(handler){
					el.removeEventListener(evt, handler, false);
				});
			}
		}else{
			var proxyids = handler.proxy[evt];
			if(proxyids.length){
				proxyids.forEach(function(proxyid){
					el.removeEventListener(evt, proxies[proxyid], false);
				});
			}
		}
    }

    /**
     * {DOM} delegate element
     * {String} eventName
     * {String} selector of sub elements
     * {Function} handler
     */
    var _delegate = function (el, evt, sel, handler) {
		var proxy = function (e) {
			e.originEvent = e;
			for(var p in e.detail){
				e[p] = e.detail[p]
			}
			var integratSelector = utils.getSelector(el) + " " + sel;
			var match = utils.matchSelector(e.target, integratSelector);
			if(match){handler.call(e.target, e);}
        }
		
		handler.proxy = handler.proxy || {};
		if(!handler.proxy[evt]){
			handler.proxy[evt] = [proxyid++];
		}else{
			handler.proxy[evt].push(proxyid++);
		}
		proxies.push(proxy);
		
		el.listeners = el.listeners || {};
		if(!el.listeners[evt]){
			el.listeners[evt] = [proxy];
		}else{
			el.listeners[evt].push(proxy);
		}
        el.addEventListener(evt, proxy, false);
    }

    /**
     * {DOM} delegate element
     * {String} eventName
     * {String} selector of sub elements
     * {Function} the same handler of _on
     */
    var _undelegate = function (el, evt, sel, handler) {
		if(!handler){
			var listeners = el.listeners[evt];
			listeners.forEach(function(proxy){
				el.removeEventListener(evt ,proxy, false);
			});
		}else{
			var proxyids = handler.proxy[evt];
			if(proxyids.length){
				proxyids.forEach(function(proxyid){
					el.removeEventListener(evt, proxies[proxyid], false);
				});
			}
		}
    }

    /** Lever 2: 手势识别 */
	var HOLD_TIME = 650,
		DOUBLE_TAP_GAP = 300,
		previousTouch = [],
		currentTouch = [],
		gesture = {},
		touchTimer,
		holdTimer;
	
	var config = {
        tap: true,
        doubleTap: true,
        tapMaxDistance: 10,
        hold: true,
        holdTime: 650,//ms
        maxDoubleTapInterval: 300,
       
        //swipe
        swipe: true,
        swipeTime: 300,
        swipeMinDistance: 18,
        swipeFactor: 5,
        
        drag: true,
        //pinch config, minScaleRate与minRotationAngle先指定为0
        pinch: true,
        minScaleRate: 0,
        minRotationAngle: 0
    };
	
	var gestureUtils = {
	
		angle : function (A, B) {
			var angle = Math.atan((B.y - A.y) * -1 / (B.x - A.x)) * (180 / Math.PI);
			return angle < 0 ? angle + 180 : angle;
		},
		
		distance : function(A, B){
			return Math.sqrt((B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y));
		},
		
		direction : function(A, B){
			var x = Math.abs(A.x - B.x);
			var y = Math.abs(A.y - B.y)
			if(x >= y){
				return A.x - B.x > 0 ? "left" : "right";
			}else{
				return A.y - B.y > 0 ? "up" : "down";
			}
		},
		scale : function(A, B){
			if(A.length >= 2 && B.length >= 2) {
                var disStart = this.distance(A[1], A[0]);
                var disEnd = this.distance(B[1], B[0]);
                
                return disEnd / disStart;
            }
            return 1;
		}
	}
	
    var _onTouchStart = function (event) {
		touchTimer && clearTimeout(touchTimer);
		var now = Date.now();
        var delta = now - (gesture.time || now);
        var touches = event.touches;
        var fingers = touches.length;
		if(!gesture.taps){ gesture.taps = 0;}
        previousTouch = _touchesInfo(touches);
		gesture.el = touches[0].target;		//touch element
		gesture.fingers = fingers;			//touch finger count
        gesture.time = now;					//touch time
		gesture.taps++;						//touch tap count
		gesture.offset = {
			top : gesture.el.getBoundingClientRect().top + ( window.pageYOffset || document.documentElement.scrollTop )  - ( document.documentElement.clientTop  || 0 ),
			left : gesture.el.getBoundingClientRect().left + ( window.pageXOffset || document.documentElement.scrollLeft ) - ( document.documentElement.clientLeft || 0 )
		}
        if (fingers === 1) {
			gesture.gap = delta > 0 && delta <= DOUBLE_TAP_GAP;
			holdTimer = setTimeout(_hold, HOLD_TIME);
            return;
        }
		if (fingers === 2) {
            gesture.initAngle = parseInt(gestureUtils.angle(previousTouch[0], previousTouch[1]));
            gesture.initDistance = parseInt(gestureUtils.distance(previousTouch[0], previousTouch[1]));
            gesture.angleDiff = 0;
            gesture.distanceDiff = 0;
			return;
        }
    };
	
    var _onTouchMove = function (event) {
		if (gesture.el) {
			var touches = event.touches;
			var fingers = touches.length;
            if (fingers === gesture.fingers) {
                currentTouch = _touchesInfo(touches);
				var isswipe= _swipe(event);
				if(isswipe){gesture.prevSwipe = true;}
                if (fingers === 2) {
                    if (!_rotation()){_scale();}
                    event.preventDefault();
                }
            } else {
                _reset();
            }
        }
    };
	
    var _onTouchEnd = function (event) {
        if (gesture.fingers === 1) {
			if (gesture.taps === 2 && gesture.gap) {
				var doubleTapDetail = {
					fingersCount : 1,
					position : previousTouch[0]
				}
                _trigger(gesture.el, "doubletap", doubleTapDetail);
                _reset();
            } else if (gesture.prevSwipe) {
                var swipeDirection = gestureUtils.direction(previousTouch[0], currentTouch[0]);
				var swipeDetial = {
					position: {
					   x: currentTouch[0].x - gesture.offset.left,
					   y: currentTouch[0].y - gesture.offset.top
					},
					direction: swipeDirection.toLowerCase(),
					distance: Math.abs(parseInt(gestureUtils.distance(previousTouch[0], currentTouch[0]))),
					distanceX: currentTouch[0].x - previousTouch[0].x,
					distanceY: currentTouch[0].y - previousTouch[0].y,
					angle: parseInt(gestureUtils.angle(currentTouch[0], previousTouch[0])),
					duration: (Date.now() - gesture.time) / 1000,
					fingersCount: 1,
					factor: (10 - config.swipeFactor) * 10 * Math.pow((Date.now() - gesture.time)/1000, 2)
				}
				_trigger(gesture.el, "swipe", swipeDetial);
                _trigger(gesture.el, "swipe" + swipeDirection, swipeDetial);
                _reset();
            } else {
                if (gesture.taps === 1) {
                    touchTimer = setTimeout((function () {
						var tapDetail = {
							fingersCount: 1,
							position  : previousTouch[0]
						}
                        _trigger(gesture.el, "tap", tapDetail);
                        _reset();
                    }), 100);
                }
            }
        } else {
			if (gesture.angleDiff !== 0) {
                var rotationDirection = gesture.angleDiff > 0 ? "right" : "left";
				var rotationDetial = {
					rotation : gesture.angleDiff,
					direction : rotationDirection,
					fingersCount : 2
				}
				_trigger(gesture.el, "rotate", rotationDetial);//detail
                _trigger(gesture.el, "rotate" + rotationDirection, rotationDetial);
                _reset();
				return;
            }
            if (gesture.distanceDiff !== 0) {
                var scaleDirection = gesture.distanceDiff > 0 ? "in" : "out";
				var scaleDetail = {
					scale: gestureUtils.scale(previousTouch, currentTouch),
					rotation: gesture.angleDiff,
					direction: scaleDirection,
					distance : gesture.distanceDiff,
					fingersCount: 2,
					startRotate: function(){}
				}
				_trigger(gesture.el, 'scale', scaleDetail);//detail
                _trigger(gesture.el, 'scale' + scaleDirection, scaleDetail);
				_reset();
				return;
            }
			if (currentTouch[0] && _drag()) {
				var dragDirection = gestureUtils.direction(previousTouch[0], currentTouch[0]);
				holdTimer && clearTimeout(holdTimer);
				_trigger(gesture.el, "drag");//detail
				_trigger(gesture.el, "drag" + dragDirection);
				_reset();
			}
        }
    };
	
	var _touchesInfo = function(touches){
		var i = 0, info = [];
		touches = touches[0].targetTouches ? touches[0].targetTouches : touches;
		while(i < touches.length){
			info.push({
				x : touches[i].pageX,
				y : touches[i].pageY
			});
			i++;
		}
		return info;
	}
	
    var _swipe = function (event) {
        if (currentTouch[0]) {
            var mh = Math.abs(previousTouch[0].x - currentTouch[0].x);
            var mv = Math.abs(previousTouch[0].y - currentTouch[0].y);
            return gesture.el && (mh >= 8 || mv >= 8);
        }
        return false;
    };
	
    var _rotation = function () {
        var angle = parseInt(gestureUtils.angle(currentTouch[0], currentTouch[1]));
        var diff = parseInt(gesture.initAngle - angle);
        if (Math.abs(diff) > 20 || gesture.angleDiff !== 0) {
            var i = 0;
            var symbol = gesture.angleDiff < 0 ? "-" : "+";
            while (Math.abs(diff - gesture.angleDiff) > 90 && i++ < 10) {
                eval("diff " + symbol + "= 180;");
            }
            gesture.angleDiff = parseInt(diff, 10);
            return true;
        } else {
            return false;
        }
    };
    var _scale = function () {
        var distance = parseInt(gestureUtils.distance(currentTouch[0], currentTouch[1]));
        var diff = gesture.initDistance - distance;
        if (Math.abs(diff) > 30) {
            gesture.distanceDiff = diff;
        }
    };
	
	var _drag = function(){
		return Math.abs(previousTouch[0].x - currentTouch[0].x) > 10 || Math.abs(previousTouch[0].y - currentTouch[0].y) > 10;
	}
	
	var _hold = function () {
        if (gesture.time && (Date.now() - gesture.time >= HOLD_TIME)) {
            var holdDetail = {
				fingersCount : 1,
				position : previousTouch[0]
			}
			_trigger(gesture.el, "hold", holdDetail);
            return gesture.taps = 0;
        }
    };
	
    var _reset = function (event) {
        previousTouch = [];
        currentTouch = [];
        gesture = {};
        clearTimeout(touchTimer);
    };
	
	
	
	/**
	开发者接口
	usage:
		touch.on("#test", "tap swipeleft swiperight", handler);
		touch.trigger("#test", "tap");
		touch.off("#test", "tap swipeleft swiperight", handler);
	 */
    var _on = function() {
		
		var args = arguments;
		if(args.length < 2 || args > 4){ return console.error("unexpected arguments!");}
		var els = utils.getType(args[0]) === 'string' ? doc.querySelectorAll(args[0]) : args[0];
		els = els.length ? Array.prototype.slice.call(els) : [els];
		//事件绑定
		if(args.length === 3 && utils.getType(args[1]) === 'string'){
			var evts = args[1].split(" ");
			var handler = args[2];
			evts.forEach(function(evt){
				els.forEach(function(el){
					_bind(el, evt, handler);
				});
			});
			return ;
		}
		
		//mapEvent delegate
		if(args.length === 3 && utils.getType(args[1]) === 'object'){
			var evtMap = args[1];
			var sel = args[2];
			for(var evt in evtMap){
				els.forEach(function(el){
					_delegate(el, evt, sel, evtMap[evt]);
				});
			}
			return ;
		}
		
		//mapEvent delegate
		if(args.length === 2 && utils.getType(args[1]) === 'object'){
			var evtMap = args[1];
			for(var evt in evtMap){
				els.forEach(function(el){
					_bind(el, evt, evtMap[evt]);
				});
			}
			return ;
		}
		
		//事件代理
		if(args.length === 4){
			var el = els[0];
			var evts = args[1].split(" ");
			var sel = args[2];
			var handler = args[3];
			evts.forEach(function(evt){
				_delegate(el, evt, sel, handler);
			});
			return ;
		}
    }
	
	var _off = function(){
		var args = arguments;
		if(args.length < 1 || args.length > 4){ return console.error("unexpected arguments!");}
		var els = utils.getType(args[0]) === 'string' ? doc.querySelectorAll(args[0]) : args[0];
		els = els.length ? Array.prototype.slice.call(els) : [els];
		
		if(args.length === 1 || args.length === 2){
			els.forEach(function(el){
				var evts =  args[1] ? args[1].split(" ") : Object.keys(el.listeners);
				if(evts.length){
					evts.forEach(function(evt){
						_unbind(el, evt);
						_undelegate(el, evt);
					});
				}
			});
			return ;
		}
		
		if(args.length === 3 && utils.getType(args[2]) === 'function'){
			var handler = args[2];
			els.forEach(function(el){
				var evts = args[1].split(" ");
				evts.forEach(function(evt){
					_unbind(el, evt, handler);
				});
			});
			return ;
		}
		
		if(args.length === 3 && utils.getType(args[2]) === 'string'){
			var sel = args[2];
			els.forEach(function(el){
				var evts = args[1].split(" ");
				evts.forEach(function(evt){
					_undelegate(el, evt, sel);
				});
			});
			return ;
		}
		
		if(args.length === 4){
			var handler = args[3];
			els.forEach(function(el){
				var evts = args[1].split(" ");
				evts.forEach(function(evt){
					_undelegate(el, evt, sel, handler);
				});
			});
			return ;
		}
	}
	
	var _dispatch = function(el, evt){
		var args = arguments;
		var els = utils.getType(args[0]) === 'string' ? doc.querySelectorAll(args[0]) : args[0];
		els = els.length ? Array.prototype.call(els) : [els];
		
		els.forEach(function(el){
			_trigger(el, evt);
		});
	}
	
	exports.on = _on;
	exports.off = _off;
	exports.trigger = _dispatch;
	
	//init gesture
	(function init(){
		
		if(utils.hasTouch()){
			_bind(doc, 'DOMContentLoaded', function () {
				var env = doc.body;
				_bind(env, 'touchstart', _onTouchStart);
				_bind(env, 'touchmove', _onTouchMove);
				if (_OS.isAndroid()) {
					_bind(env, 'touchend', _onTouchEnd);
					_bind(env, 'touchcancel', function () {
						_onTouchEnd();
						_reset();
					});
				} else {
					_bind(env, 'touchend', _onTouchEnd);
					_bind(env, 'touchcancel', _reset);
				}
			}, false);
		}else{
			//on PC to be done
		}
	})();
	
})(document, touch);