import base64

username = "vmware"
password = ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]"

credentials = f"{username}:{password}"
encoded = base64.b64encode(credentials.encode()).decode()

print(f"Credentials: {credentials}")
print(f"Base64 encoded: {encoded}")
print(f"Authorization header would be: Basic {encoded}")
