"""Opt-in QA isolation for app Python processes; never installed globally.

Only numeric loopback and localhost are allowed. Reserved probe destinations are
rejected before DNS/connect; logs contain no URL paths, payloads or profile data.
Browser traffic is separately blocked by Playwright. This is not an OS firewall.
"""
import os

if os.environ.get("UTSC_OFFLINE_GUARD") == "1":
    import asyncio
    import ipaddress
    import json
    from pathlib import Path
    import socket
    import time

    def record(operation, host=None, port=None):
        item = {"pid": os.getpid(), "operation": operation, "host": str(host) if host is not None else None,
                "port": port, "time_unix": time.time()}
        with Path(os.environ["UTSC_OFFLINE_LOG"]).open("a",encoding="utf-8") as output:
            output.write(json.dumps(item)+"\n")

    def allowed(host):
        if host in (None,"localhost",b"localhost"): return True
        try:
            if isinstance(host,bytes): host = host.decode("ascii")
            return ipaddress.ip_address(host).is_loopback
        except (ValueError,TypeError): return False

    def check(operation,host,port=None):
        if not allowed(host):
            record(operation,host,port)
            raise PermissionError("OFFLINE_GUARD: non-loopback networking is disabled for this QA process")

    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    original_sendto = socket.socket.sendto
    original_getaddrinfo = socket.getaddrinfo
    original_create_connection = asyncio.BaseEventLoop.create_connection
    original_create_datagram = asyncio.BaseEventLoop.create_datagram_endpoint

    def connect(self,address):
        if isinstance(address,tuple): check("blocked_connect",address[0],address[1])
        return original_connect(self,address)

    def connect_ex(self,address):
        if isinstance(address,tuple): check("blocked_connect_ex",address[0],address[1])
        return original_connect_ex(self,address)

    def sendto(self,data,*args):
        address = args[-1]
        if isinstance(address,tuple): check("blocked_sendto",address[0],address[1])
        return original_sendto(self,data,*args)

    def getaddrinfo(host,port,*args,**kwargs):
        check("blocked_dns",host,port)
        return original_getaddrinfo(host,port,*args,**kwargs)

    async def create_connection(self,protocol_factory,host=None,port=None,**kwargs):
        check("blocked_async_connect",host,port)
        return await original_create_connection(self,protocol_factory,host,port,**kwargs)

    async def create_datagram(self,protocol_factory,local_addr=None,remote_addr=None,**kwargs):
        if remote_addr: check("blocked_async_datagram",remote_addr[0],remote_addr[1])
        return await original_create_datagram(self,protocol_factory,local_addr=local_addr,remote_addr=remote_addr,**kwargs)

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    socket.socket.sendto = sendto
    socket.getaddrinfo = getaddrinfo
    asyncio.BaseEventLoop.create_connection = create_connection
    asyncio.BaseEventLoop.create_datagram_endpoint = create_datagram
    record("guard_active")
    # These probes never reach the network; all destinations are reserved examples.
    with socket.socket() as probe:
        try: probe.connect(("203.0.113.1",443))
        except PermissionError: pass
        else: raise RuntimeError("Offline connect guard failed")
        try: probe.connect_ex(("203.0.113.2",443))
        except PermissionError: pass
        else: raise RuntimeError("Offline connect_ex guard failed")
    try: socket.getaddrinfo("offline-probe.invalid",443)
    except PermissionError: pass
    else: raise RuntimeError("Offline DNS guard failed")
