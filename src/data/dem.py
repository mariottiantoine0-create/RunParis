import numpy as np
la0,la1,lo0,lo1,W,H=48.799,48.975,2.180,2.500,4572,3520
Z=np.fromfile('/mnt/user-data/uploads/Downloads/RunParis-data/ext_dem.f32',dtype='<f4').reshape(H,W)
def ele(lat,lon):
    lat=np.asarray(lat,float); lon=np.asarray(lon,float)
    x=(lon-lo0)/(lo1-lo0)*W-0.5; y=(la1-lat)/(la1-la0)*H-0.5
    x0=np.clip(np.floor(x).astype(int),0,W-2); y0=np.clip(np.floor(y).astype(int),0,H-2)
    fx=np.clip(x-x0,0,1); fy=np.clip(y-y0,0,1)
    return (Z[y0,x0]*(1-fx)*(1-fy)+Z[y0,x0+1]*fx*(1-fy)+Z[y0+1,x0]*(1-fx)*fy+Z[y0+1,x0+1]*fx*fy)
