import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const API_PREFIX = "/make-server-dcadf1e7";
const PLAYER_PREFIX = "player:";
const GAME_PREFIX = "game:";

const emptyOverallStats = () => ({
  games_played: 0,
  wins: 0,
  losses: 0,
  total_minutes: 0,
  total_points: 0,
  total_fga: 0,
  total_fgm: 0,
  total_3pa: 0,
  total_3pm: 0,
  total_2pa: 0,
  total_2pm: 0,
  total_fta: 0,
  total_ftm: 0,
  total_rebounds: 0,
  total_oreb: 0,
  total_dreb: 0,
  total_assists: 0,
  total_turnovers: 0,
  total_steals: 0,
  total_blocks: 0,
  total_fouls: 0,
  total_plus_minus: 0,
  total_double_doubles: 0,
  total_triple_doubles: 0,
});

const emptyGameStats = () => ({
  pts: 0,
  fga: 0,
  fgm: 0,
  "3pa": 0,
  "3pm": 0,
  fta: 0,
  ftm: 0,
  reb: 0,
  oreb: 0,
  dreb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  blk: 0,
  pf: 0,
  plus_minus: 0,
  is_double_double: false,
  is_triple_double: false,
});

const now = () => new Date().toISOString();
const playerKey = (id: string) => `${PLAYER_PREFIX}${id}`;
const gameKey = (id: string) => `${GAME_PREFIX}${id}`;
const objectId = () => crypto.randomUUID();
const idOf = (value: any) =>
  typeof value === "string" ? value : value?._id || value?.id || "";

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const getPlayer = (id: string) => kv.get(playerKey(id));
const getGame = (id: string) => kv.get(gameKey(id));

async function requireAdmin(c: any) {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: c.json({ message: "Not authorized, no token" }, 401) };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { response: c.json({ message: "Not authorized, token failed" }, 401) };
  }

  return { user: data.user };
}

function normalizeTeam(team: any, fallbackName: string) {
  if (Array.isArray(team)) {
    return { name: fallbackName, players: team.map(idOf).filter(Boolean) };
  }
  return {
    name: team?.name || fallbackName,
    players: (team?.players || []).map(idOf).filter(Boolean),
  };
}

async function hydrateGame(game: any) {
  if (!game) return null;
  const ids = Array.from(
    new Set(
      [
        ...(game.all_player_ids || []),
        ...(game.teams?.team_a?.players || []),
        ...(game.teams?.team_b?.players || []),
      ].map(idOf).filter(Boolean),
    ),
  );
  const players = await Promise.all(ids.map((id) => getPlayer(id)));
  const playerMap = new Map(
    players.filter(Boolean).map((player) => [player._id, player]),
  );

  return {
    ...game,
    all_player_ids: ids.map((id) => playerMap.get(id)).filter(Boolean),
    teams: {
      team_a: {
        ...game.teams?.team_a,
        players: (game.teams?.team_a?.players || [])
          .map(idOf)
          .map((id: string) => playerMap.get(id) || id),
      },
      team_b: {
        ...game.teams?.team_b,
        players: (game.teams?.team_b?.players || [])
          .map(idOf)
          .map((id: string) => playerMap.get(id) || id),
      },
    },
    events: (game.events || []).map((event: any) => ({
      ...event,
      player_id: playerMap.get(idOf(event.player_id)) || event.player_id,
    })),
  };
}

function calculateGameStats(game: any) {
  const playerIds = (game.all_player_ids || []).map(idOf).filter(Boolean);
  const summary: Record<string, any> = Object.fromEntries(
    playerIds.map((id: string) => [id, emptyGameStats()]),
  );

  for (const event of game.events || []) {
    const playerId = idOf(event.player_id);
    if (!summary[playerId]) summary[playerId] = emptyGameStats();
    const stat = summary[playerId];

    if (event.type === "shot") {
      stat.fga += 1;
      if (event.made) {
        stat.fgm += 1;
        stat.pts += Number(event.points || 0);
      }
      if (Number(event.points) >= 3) {
        stat["3pa"] += 1;
        if (event.made) stat["3pm"] += 1;
      }
    } else if (event.type === "free_throw") {
      stat.fta += 1;
      if (event.made) {
        stat.ftm += 1;
        stat.pts += Number(event.points || 1);
      }
    } else if (event.type === "rebound") {
      stat.reb += 1;
      if (event.rebound_type === "offensive") stat.oreb += 1;
      if (event.rebound_type === "defensive") stat.dreb += 1;
    } else if (event.type === "assist") {
      stat.ast += 1;
    } else if (event.type === "turnover") {
      stat.tov += 1;
    } else if (event.type === "steal") {
      stat.stl += 1;
    } else if (event.type === "block") {
      stat.blk += 1;
    } else if (event.type === "foul") {
      stat.pf += 1;
    }
  }

  for (const stat of Object.values(summary) as any[]) {
    const qualifying = [stat.pts, stat.reb, stat.ast, stat.stl, stat.blk]
      .filter((value) => value >= 10).length;
    stat.is_double_double = qualifying >= 2;
    stat.is_triple_double = qualifying >= 3;
  }
  return summary;
}

async function applyFinalStats(game: any) {
  const summary = calculateGameStats(game);
  const teamA = new Set((game.teams?.team_a?.players || []).map(idOf));
  const teamB = new Set((game.teams?.team_b?.players || []).map(idOf));

  for (const [playerId, stats] of Object.entries(summary) as [string, any][]) {
    const player = await getPlayer(playerId);
    if (!player) continue;
    const overall = { ...emptyOverallStats(), ...(player.overall_stats || {}) };
    overall.games_played += 1;
    if (game.winner === "team_a" && teamA.has(playerId)) overall.wins += 1;
    else if (game.winner === "team_b" && teamB.has(playerId)) overall.wins += 1;
    else if (game.winner) overall.losses += 1;
    overall.total_points += stats.pts;
    overall.total_fga += stats.fga;
    overall.total_fgm += stats.fgm;
    overall.total_3pa += stats["3pa"];
    overall.total_3pm += stats["3pm"];
    overall.total_2pa += stats.fga - stats["3pa"];
    overall.total_2pm += stats.fgm - stats["3pm"];
    overall.total_fta += stats.fta;
    overall.total_ftm += stats.ftm;
    overall.total_rebounds += stats.reb;
    overall.total_oreb += stats.oreb;
    overall.total_dreb += stats.dreb;
    overall.total_assists += stats.ast;
    overall.total_turnovers += stats.tov;
    overall.total_steals += stats.stl;
    overall.total_blocks += stats.blk;
    overall.total_fouls += stats.pf;
    overall.total_plus_minus += stats.plus_minus;
    if (stats.is_double_double) overall.total_double_doubles += 1;
    if (stats.is_triple_double) overall.total_triple_doubles += 1;

    const shots = (game.events || [])
      .filter((event: any) =>
        idOf(event.player_id) === playerId &&
        ["shot", "free_throw"].includes(event.type) &&
        event.location
      )
      .map((event: any) => ({
        x: event.location.x,
        y: event.location.y,
        made: Boolean(event.made),
        points: Number(event.points || 0),
        game_id: game._id,
        timestamp: event.timestamp,
      }));

    await kv.set(playerKey(playerId), {
      ...player,
      overall_stats: overall,
      all_time_shot_data: [...(player.all_time_shot_data || []), ...shots],
      updatedAt: now(),
    });
  }
  return summary;
}

app.get(`${API_PREFIX}/health`, (c) => c.json({ status: "ok" }));

app.post(`${API_PREFIX}/user/login`, async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ message: "Email and password are required" }, 400);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error || !data.session || !data.user) {
    return c.json({ message: "Invalid credentials" }, 401);
  }
  return c.json({
    message: "Login successful",
    token: data.session.access_token,
    user: {
      _id: data.user.id,
      email: data.user.email,
      role: "admin",
    },
  });
});

app.get(`${API_PREFIX}/player/all`, async (c) => {
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.max(1, Number(c.req.query("limit") || 25));
  const players = (await kv.getByPrefix(PLAYER_PREFIX))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const start = (page - 1) * limit;
  return c.json({
    players: players.slice(start, start + limit),
    page,
    total: players.length,
  });
});

app.get(`${API_PREFIX}/player`, async (c) => {
  const search = String(c.req.query("search") || "").trim().toLowerCase();
  const limit = Number(c.req.query("limit") || 0);
  let players = await kv.getByPrefix(PLAYER_PREFIX);
  if (search) {
    players = players.filter((player) =>
      [player.name, player.instagram_handle, player.hometown]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }
  players.sort((a, b) =>
    (a.instagram_handle || a.name || "").localeCompare(
      b.instagram_handle || b.name || "",
    )
  );
  return c.json(limit > 0 ? players.slice(0, limit) : players);
});

app.post(`${API_PREFIX}/player`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const input = await c.req.json();
  if (!input.name && !input.instagram_handle) {
    return c.json({ message: "Name or Instagram handle is required" }, 400);
  }
  const timestamp = now();
  const player = {
    ...input,
    _id: objectId(),
    created_by: auth.user!.id,
    profile_image_url: input.profile_image_url ||
      "../public/images/default_image.png",
    bio: input.bio || "Player at TheNextChapter!",
    overall_stats: emptyOverallStats(),
    all_time_shot_data: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await kv.set(playerKey(player._id), player);
  return c.json(player, 201);
});

app.get(`${API_PREFIX}/player/:id/games`, async (c) => {
  const id = c.req.param("id");
  const games = (await kv.getByPrefix(GAME_PREFIX))
    .filter((game) => (game.all_player_ids || []).map(idOf).includes(id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return c.json(await Promise.all(games.map(hydrateGame)));
});

app.get(`${API_PREFIX}/player/:id/shot-chart`, async (c) => {
  const player = await getPlayer(c.req.param("id"));
  if (!player) return c.json({ message: "Player not found" }, 404);
  const gameId = c.req.query("gameId");
  const shots = (player.all_time_shot_data || []).filter((shot: any) =>
    !gameId || shot.game_id === gameId
  );
  return c.json({ playerId: player._id, shots });
});

app.get(`${API_PREFIX}/player/:id`, async (c) => {
  const player = await getPlayer(c.req.param("id"));
  return player
    ? c.json(player)
    : c.json({ message: "Player not found" }, 404);
});

app.patch(`${API_PREFIX}/player/:id`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const player = await getPlayer(c.req.param("id"));
  if (!player) return c.json({ message: "Player not found" }, 404);
  const updates = await c.req.json();
  const updated = {
    ...player,
    ...updates,
    _id: player._id,
    created_by: player.created_by,
    overall_stats: player.overall_stats,
    all_time_shot_data: player.all_time_shot_data,
    createdAt: player.createdAt,
    updatedAt: now(),
  };
  await kv.set(playerKey(player._id), updated);
  return c.json(updated);
});

app.delete(`${API_PREFIX}/player/:id`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const id = c.req.param("id");
  if (!await getPlayer(id)) return c.json({ message: "Player not found" }, 404);
  await kv.del(playerKey(id));
  return c.json({ message: "Player deleted successfully" });
});

app.get(`${API_PREFIX}/game`, async (c) => {
  const games = (await kv.getByPrefix(GAME_PREFIX))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return c.json(await Promise.all(games.map(hydrateGame)));
});

app.post(`${API_PREFIX}/game`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const input = await c.req.json();
  const teamA = normalizeTeam(
    input.teams?.team_a || input.team_a,
    input.teams?.team_a?.name || "Team A",
  );
  const teamB = normalizeTeam(
    input.teams?.team_b || input.team_b,
    input.teams?.team_b?.name || "Team B",
  );
  const timestamp = now();
  const game = {
    ...input,
    _id: objectId(),
    created_by: auth.user!.id,
    game_type: input.game_type || "1v1",
    status: input.status || "in_progress",
    all_player_ids: Array.from(new Set([...teamA.players, ...teamB.players])),
    teams: { team_a: teamA, team_b: teamB },
    final_score: input.final_score || { team_a: 0, team_b: 0 },
    winner: input.winner || null,
    live_stats_applied: false,
    events: [],
    game_stats_summary: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  delete game.team_a;
  delete game.team_b;
  await kv.set(gameKey(game._id), game);
  return c.json(await hydrateGame(game), 201);
});

app.get(`${API_PREFIX}/game/:id`, async (c) => {
  const game = await getGame(c.req.param("id"));
  return game
    ? c.json(await hydrateGame(game))
    : c.json({ message: "Game not found" }, 404);
});

app.post(`${API_PREFIX}/game/:id/event`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const game = await getGame(c.req.param("id"));
  if (!game) return c.json({ message: "Game not found" }, 404);
  if (game.status !== "in_progress") {
    return c.json({ message: "Events can only be added to active games" }, 400);
  }
  const input = await c.req.json();
  const playerId = idOf(input.player_id);
  if (!playerId || !await getPlayer(playerId)) {
    return c.json({ message: "Valid player_id is required" }, 400);
  }
  const event = {
    ...input,
    _id: objectId(),
    player_id: playerId,
    timestamp: input.timestamp || now(),
  };
  const updated = {
    ...game,
    events: [...(game.events || []), event],
    updatedAt: now(),
  };
  await kv.set(gameKey(game._id), updated);
  return c.json({ message: "Event added successfully", event });
});

app.patch(`${API_PREFIX}/game/:id/finish`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const game = await getGame(c.req.param("id"));
  if (!game) return c.json({ message: "Game not found" }, 404);
  const input = await c.req.json().catch(() => ({}));
  const score = input.final_score || (game.events || []).reduce(
    (total: any, event: any) => {
      if (event.made && ["shot", "free_throw"].includes(event.type)) {
        total[event.team] += Number(event.points || 0);
      }
      return total;
    },
    { team_a: 0, team_b: 0 },
  );
  const winner = input.winner === "draw"
    ? null
    : input.winner ||
      (score.team_a === score.team_b
        ? null
        : score.team_a > score.team_b
        ? "team_a"
        : "team_b");
  const completed = {
    ...game,
    status: "finished",
    final_score: score,
    winner,
    updatedAt: now(),
  };
  if (!game.live_stats_applied) {
    completed.game_stats_summary = await applyFinalStats(completed);
    completed.live_stats_applied = true;
  }
  await kv.set(gameKey(game._id), completed);
  return c.json({
    message: "Game finalized successfully",
    game: await hydrateGame(completed),
  });
});

app.patch(`${API_PREFIX}/game/:id/cancel`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const game = await getGame(c.req.param("id"));
  if (!game) return c.json({ message: "Game not found" }, 404);
  const updated = { ...game, status: "canceled", updatedAt: now() };
  await kv.set(gameKey(game._id), updated);
  return c.json({ message: "Game canceled successfully", game: updated });
});

app.patch(`${API_PREFIX}/game/:id`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const game = await getGame(c.req.param("id"));
  if (!game) return c.json({ message: "Game not found" }, 404);
  const input = await c.req.json();
  const teamA = input.teams?.team_a
    ? normalizeTeam(input.teams.team_a, game.teams.team_a.name)
    : game.teams.team_a;
  const teamB = input.teams?.team_b
    ? normalizeTeam(input.teams.team_b, game.teams.team_b.name)
    : game.teams.team_b;
  const updated = {
    ...game,
    ...input,
    _id: game._id,
    created_by: game.created_by,
    teams: { team_a: teamA, team_b: teamB },
    all_player_ids: Array.from(new Set([...teamA.players, ...teamB.players])),
    events: game.events,
    game_stats_summary: game.game_stats_summary,
    createdAt: game.createdAt,
    updatedAt: now(),
  };
  await kv.set(gameKey(game._id), updated);
  return c.json(await hydrateGame(updated));
});

app.delete(`${API_PREFIX}/game/:id`, async (c) => {
  const auth = await requireAdmin(c);
  if (auth.response) return auth.response;
  const id = c.req.param("id");
  if (!await getGame(id)) return c.json({ message: "Game not found" }, 404);
  await kv.del(gameKey(id));
  return c.json({ message: "Game deleted successfully" });
});

app.onError((error, c) => {
  console.error("Server error:", error);
  return c.json({ message: error.message || "Internal server error" }, 500);
});

Deno.serve(app.fetch);
